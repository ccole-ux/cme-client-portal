import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCmeEmail } from "@/lib/notifications/resend";

export const runtime = "nodejs";

const BodySchema = z.object({
  decisions: z.record(z.string(), z.enum(["accept", "reject", "skip"])),
  reviewer_note: z.string().max(500).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: submissionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "cme_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { decisions, reviewer_note } = parsed.data;

  // Load the submission + all its changes.
  const { data: submission, error: subErr } = await supabase
    .from("change_submissions")
    .select("id, project_id, submitter_id, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr || !submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.status !== "pending_review") {
    return NextResponse.json(
      { error: `Submission already ${submission.status}` },
      { status: 400 },
    );
  }

  const { data: changes } = await supabase
    .from("proposed_changes")
    .select("*")
    .eq("submission_id", submissionId);

  if (!changes || changes.length === 0) {
    return NextResponse.json(
      { error: "Submission has no proposed changes" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const ch of changes) {
    const decision = decisions[ch.id] ?? "skip";
    if (decision === "skip") continue;

    if (decision === "reject") {
      rejectedCount++;
      await admin
        .from("proposed_changes")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewer_note ?? null,
        })
        .eq("id", ch.id);
      continue;
    }

    // decision === "accept" — apply change_data to the canonical entity.
    try {
      await applyAcceptedChange(admin, ch);
      acceptedCount++;
      await admin
        .from("proposed_changes")
        .update({
          status: "accepted",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          applied_at: new Date().toISOString(),
          review_note: reviewer_note ?? null,
        })
        .eq("id", ch.id);
    } catch (err) {
      console.error("[review] failed to apply change", ch.id, err);
      await admin
        .from("proposed_changes")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note:
            (reviewer_note ? reviewer_note + "\n\n" : "") +
            "[auto] Apply failed: " +
            String(err),
        })
        .eq("id", ch.id);
      rejectedCount++;
    }
  }

  // Decide submission-level status.
  const finalStatus: "accepted" | "rejected" | "mixed" =
    acceptedCount > 0 && rejectedCount === 0
      ? "accepted"
      : acceptedCount === 0 && rejectedCount > 0
        ? "rejected"
        : "mixed";

  await supabase
    .from("change_submissions")
    .update({
      status: finalStatus,
      reviewer_id: user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_note: reviewer_note ?? null,
    })
    .eq("id", submissionId);

  // Any accepted changes → capture a new accepted_version snapshot.
  let snapshotId: string | null = null;
  if (acceptedCount > 0) {
    const { data, error: snapErr } = await supabase.rpc(
      "capture_accepted_version_snapshot",
      {
        p_project_id: submission.project_id,
        p_submission_id: submissionId,
        p_reviewer_id: user.id,
        p_label: null,
      },
    );
    if (snapErr) {
      console.warn("[review] snapshot rpc failed", snapErr);
    } else if (typeof data === "string") {
      snapshotId = data;
    }
  }

  await supabase.from("audit_log").insert({
    project_id: submission.project_id,
    actor_id: user.id,
    action: "submission.review",
    entity_type: "change_submission",
    entity_id: submissionId,
    payload: {
      final_status: finalStatus,
      accepted: acceptedCount,
      rejected: rejectedCount,
      snapshot_id: snapshotId,
      reviewer_note: reviewer_note ?? null,
    },
  });

  // Notify submitter via email + notifications row.
  notifySubmitter({
    submissionId,
    projectId: submission.project_id,
    submitterId: submission.submitter_id,
    finalStatus,
    acceptedCount,
    rejectedCount,
    reviewerNote: reviewer_note ?? null,
  }).catch((err) => console.warn("[review] notify failed", err));

  return NextResponse.json({
    ok: true,
    final_status: finalStatus,
    accepted: acceptedCount,
    rejected: rejectedCount,
    snapshot_id: snapshotId,
  });
}

/**
 * Apply an accepted proposed_change to the canonical entity. Branches by
 * entity_type + operation. Uses the admin client because canonical writes go
 * through audit triggers that run SECURITY DEFINER and the auth.uid() in the
 * trigger surface still reflects the admin user.
 */
async function applyAcceptedChange(
  admin: ReturnType<typeof createAdminClient>,
  ch: {
    id: string;
    operation: "create" | "update" | "delete";
    entity_type: string;
    entity_id: string | null;
    change_data: unknown;
    project_id: string;
  },
) {
  const cd = (ch.change_data ?? {}) as Record<string, unknown>;

  if (ch.entity_type === "workplan_task") {
    if (ch.operation === "update" && ch.entity_id) {
      const patch = flattenDiff(cd);
      if (Object.keys(patch).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (admin.from("workplan_tasks") as any)
          .update(patch)
          .eq("id", ch.entity_id);
        if (error) throw error;
      }
      return;
    }
    if (ch.operation === "create") {
      const payload: Record<string, unknown> = { project_id: ch.project_id };
      for (const [k, v] of Object.entries(cd)) payload[k] = v;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin.from("workplan_tasks") as any).insert(payload);
      if (error) throw error;
      return;
    }
    if (ch.operation === "delete" && ch.entity_id) {
      const { error } = await admin
        .from("workplan_tasks")
        .delete()
        .eq("id", ch.entity_id);
      if (error) throw error;
      return;
    }
  }

  if (ch.entity_type === "task_dependency") {
    if (ch.operation === "create") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin.from("task_dependencies") as any).insert({
        project_id: ch.project_id,
        predecessor_task_id: cd.predecessor_task_id as string,
        successor_task_id: cd.successor_task_id as string,
        dependency_type: (cd.dependency_type as string) ?? "FS",
        lag_days: Number(cd.lag_days ?? 0),
      });
      if (error) throw error;
      return;
    }
    if (ch.operation === "delete" && ch.entity_id) {
      const { error } = await admin
        .from("task_dependencies")
        .delete()
        .eq("id", ch.entity_id);
      if (error) throw error;
      return;
    }
  }

  throw new Error(
    `Unsupported change: ${ch.entity_type}.${ch.operation}`,
  );
}

function flattenDiff(cd: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(cd)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "new" in (value as Record<string, unknown>)
    ) {
      out[field] = (value as { new: unknown }).new;
    } else {
      out[field] = value;
    }
  }
  return out;
}

async function notifySubmitter(args: {
  submissionId: string;
  projectId: string;
  submitterId: string;
  finalStatus: "accepted" | "rejected" | "mixed";
  acceptedCount: number;
  rejectedCount: number;
  reviewerNote: string | null;
}) {
  const admin = createAdminClient();
  const { data: submitter } = await admin
    .from("users")
    .select("email, full_name")
    .eq("id", args.submitterId)
    .maybeSingle();
  if (!submitter) return;

  const { data: project } = await admin
    .from("projects")
    .select("slug, client_short, name")
    .eq("id", args.projectId)
    .maybeSingle();

  await admin.from("notifications").insert({
    user_id: args.submitterId,
    project_id: args.projectId,
    kind: "submission.reviewed",
    entity_type: "change_submission",
    entity_id: args.submissionId,
    payload: {
      title: `Submission ${args.finalStatus}`,
      accepted: args.acceptedCount,
      rejected: args.rejectedCount,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = project ? `${appUrl}/p/${project.slug}/submissions` : appUrl;
  const headings: Record<typeof args.finalStatus, string> = {
    accepted: "SUBMISSION ACCEPTED",
    rejected: "SUBMISSION REJECTED",
    mixed: "SUBMISSION REVIEWED",
  };
  const intro =
    args.finalStatus === "accepted"
      ? `All ${args.acceptedCount} change${args.acceptedCount === 1 ? " was" : "s were"} accepted and applied to ${project?.client_short ?? "the project"}.`
      : args.finalStatus === "rejected"
        ? `All ${args.rejectedCount} change${args.rejectedCount === 1 ? " was" : "s were"} rejected. See note below.`
        : `${args.acceptedCount} accepted, ${args.rejectedCount} rejected. See detail below.`;

  await sendCmeEmail({
    to: submitter.email,
    subject: `Your submission was reviewed — ${project?.client_short ?? "project"}`,
    heading: headings[args.finalStatus],
    intro,
    bodyHtml: args.reviewerNote
      ? `<p style="margin:0 0 8px;font-size:13px;color:#555;"><strong>Reviewer note:</strong></p><blockquote style="margin:0;padding:12px 16px;background:#fafaf9;border-left:3px solid #3C9D48;font-size:13px;color:#444;">${escapeHtml(args.reviewerNote)}</blockquote>`
      : "",
    cta: { label: "View your submissions", url },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
