import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCmeEmail } from "@/lib/notifications/resend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entity_type and entity_id required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select(
      "*, author:users!comments_author_id_fkey(full_name, email)",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ items: data ?? [] });
}

const PostSchema = z.object({
  project_id: z.string().uuid(),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid(),
  parent_comment_id: z.string().uuid().nullable().optional(),
  body_markdown: z.string().min(1).max(4000),
  mentions: z.array(z.string().uuid()).default([]),
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
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("comments")
    .insert({
      project_id: parsed.data.project_id,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      parent_comment_id: parsed.data.parent_comment_id ?? null,
      author_id: user.id,
      body_markdown: parsed.data.body_markdown,
      mentions: parsed.data.mentions,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "failed" },
      { status: 400 },
    );
  }

  // Notifications + emails for mentioned users.
  if (parsed.data.mentions.length > 0) {
    const admin = createAdminClient();
    await admin.from("notifications").insert(
      parsed.data.mentions.map((uid) => ({
        user_id: uid,
        project_id: parsed.data.project_id,
        kind: "comment.mention",
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        payload: {
          comment_id: inserted.id,
          title: "You were mentioned in a comment",
        },
      })),
    );

    const { data: mentioned } = await admin
      .from("users")
      .select("email, full_name")
      .in("id", parsed.data.mentions);
    const { data: project } = await admin
      .from("projects")
      .select("slug, name, client_short")
      .eq("id", parsed.data.project_id)
      .maybeSingle();
    const { data: author } = await admin
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const entityUrl = entityUrlFor(
      project?.slug,
      parsed.data.entity_type,
      parsed.data.entity_id,
      appUrl,
    );
    const authorLabel = author?.full_name ?? author?.email ?? "A user";

    for (const m of mentioned ?? []) {
      await sendCmeEmail({
        to: m.email,
        subject: `${authorLabel} mentioned you on ${project?.client_short ?? "a project"}`,
        heading: "YOU WERE MENTIONED",
        intro: `${authorLabel} tagged you in a comment on ${project?.name ?? "a project"}.`,
        bodyHtml: `<blockquote style="margin:0;padding:12px 16px;background:#fafaf9;border-left:3px solid #3C9D48;font-size:13px;color:#444;white-space:pre-wrap;">${escapeHtml(parsed.data.body_markdown)}</blockquote>`,
        cta: entityUrl ? { label: "Open in portal", url: entityUrl } : undefined,
      });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}

function entityUrlFor(
  slug: string | undefined,
  type: string,
  id: string,
  baseUrl: string,
): string | null {
  if (!slug || !baseUrl) return null;
  if (type === "workplan_task") return `${baseUrl}/p/${slug}/gantt?task=${id}`;
  if (type === "narrative_section") return `${baseUrl}/p/${slug}`;
  if (type === "change_submission") return `${baseUrl}/p/${slug}/submissions`;
  return `${baseUrl}/p/${slug}/activity`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
