import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCmeEmail } from "@/lib/notifications/resend";

export const runtime = "nodejs";

const PostSchema = z.object({
  project_id: z.string().uuid(),
  submitter_note: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { project_id, submitter_note } = parsed.data;

  // Find all caller's drafts in this project. Enforced through RLS + explicit
  // filter. At least 1 draft required.
  const { data: drafts, error: draftsErr } = await supabase
    .from("proposed_changes")
    .select("id")
    .eq("project_id", project_id)
    .eq("proposed_by", user.id)
    .eq("status", "draft");

  if (draftsErr) {
    return NextResponse.json({ error: draftsErr.message }, { status: 400 });
  }
  if (!drafts || drafts.length === 0) {
    return NextResponse.json(
      { error: "No drafts to submit on this project." },
      { status: 400 },
    );
  }

  // Create the submission row using the caller's RLS-scoped client so the
  // change_submissions INSERT policy (submitter_id = auth.uid()) applies.
  const { data: submission, error: subErr } = await supabase
    .from("change_submissions")
    .insert({
      project_id,
      submitter_id: user.id,
      submitter_note: submitter_note ?? null,
      status: "pending_review",
    })
    .select("id, project_id")
    .single();

  if (subErr || !submission) {
    return NextResponse.json(
      { error: subErr?.message ?? "Failed to create submission" },
      { status: 400 },
    );
  }

  // Flip drafts to submitted + attach submission_id in one query. pc_update_own_draft
  // gates this to the owner.
  const { error: flipErr } = await supabase
    .from("proposed_changes")
    .update({
      status: "submitted",
      submission_id: submission.id,
    })
    .eq("project_id", project_id)
    .eq("proposed_by", user.id)
    .eq("status", "draft");

  if (flipErr) {
    // Best-effort rollback — try to delete the empty submission we just
    // created. If this fails too, the submission will sit with zero
    // proposed_changes which the review UI handles gracefully.
    await supabase
      .from("change_submissions")
      .delete()
      .eq("id", submission.id);
    return NextResponse.json({ error: flipErr.message }, { status: 400 });
  }

  // Snapshot via the capture_submission_snapshot RPC. This uses the RLS-scoped
  // client; the function itself is SECURITY DEFINER so it can write
  // workplan_snapshots despite the admin-only policy.
  const { error: snapErr } = await supabase.rpc("capture_submission_snapshot", {
    p_submission_id: submission.id,
  });
  if (snapErr) {
    console.warn("[submission] snapshot rpc failed", snapErr);
    // Non-fatal — the submission itself is valid, snapshot can be re-run.
  }

  // Audit.
  await supabase.from("audit_log").insert({
    project_id,
    actor_id: user.id,
    action: "submission.submit",
    entity_type: "change_submission",
    entity_id: submission.id,
    payload: {
      draft_count: drafts.length,
      submitter_note: submitter_note ?? null,
    },
  });

  // Email notify every CME Admin. Use admin client (service-role) to look up
  // admin emails without needing RLS-readable users rows for the caller.
  notifyCmeAdmins({
    submissionId: submission.id,
    projectId: project_id,
    submitterId: user.id,
    submitterEmail: user.email ?? "",
    submitterNote: submitter_note ?? null,
    draftCount: drafts.length,
  }).catch((err) =>
    console.warn("[submission] notify failed", err),
  );

  return NextResponse.json({ ok: true, id: submission.id });
}

async function notifyCmeAdmins(args: {
  submissionId: string;
  projectId: string;
  submitterId: string;
  submitterEmail: string;
  submitterNote: string | null;
  draftCount: number;
}) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("users")
    .select("email, full_name")
    .eq("role", "cme_admin");

  if (!admins || admins.length === 0) return;

  const { data: project } = await admin
    .from("projects")
    .select("slug, client_short, name")
    .eq("id", args.projectId)
    .maybeSingle();
  const { data: submitter } = await admin
    .from("users")
    .select("full_name, email")
    .eq("id", args.submitterId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reviewUrl = project ? `${appUrl}/p/${project.slug}/review` : appUrl;
  const submitterLabel = submitter?.full_name ?? submitter?.email ?? args.submitterEmail ?? "A portal user";
  const shortName = project?.client_short ?? "project";

  for (const a of admins) {
    await sendCmeEmail({
      to: a.email,
      subject: `New submission for review on ${shortName}`,
      heading: "NEW SUBMISSION",
      intro: `${submitterLabel} just submitted ${args.draftCount} change${args.draftCount === 1 ? "" : "s"} on ${project?.name ?? "a project"} for your review.`,
      bodyHtml: args.submitterNote
        ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Submission note:</strong></p><blockquote style="margin:0;padding:12px 16px;background:#fafaf9;border-left:3px solid #3C9D48;font-size:13px;color:#444;">${escapeHtml(args.submitterNote)}</blockquote>`
        : "",
      cta: { label: "Open review queue", url: reviewUrl },
      footer: "You are receiving this because you are a CME Admin on this project.",
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
