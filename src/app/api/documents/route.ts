import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCmeEmail } from "@/lib/notifications/resend";

export const runtime = "nodejs";
export const maxDuration = 60;

// 25MB default cap. Supabase Storage default is 5MB; the project bucket is
// provisioned with a higher limit via supabase/documents-bucket.sql which the
// user runs once in the Supabase SQL editor.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
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
  const isStaff =
    profile?.role === "cme_admin" || profile?.role === "cme_viewer";
  if (!isStaff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const projectId = String(form.get("project_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const file = form.get("file") as File | null;
  if (!projectId || !title || !file) {
    return NextResponse.json(
      { error: "project_id, title, and file are required" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Limit is ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  const admin = createAdminClient();

  // Compute version: if a document with same title exists, bump. supersedes_id
  // points at previous latest so version history is walkable.
  const { data: existing } = await supabase
    .from("documents")
    .select("id, version")
    .eq("project_id", projectId)
    .eq("title", title)
    .order("version", { ascending: false })
    .limit(1);
  const prev = existing?.[0];
  const version = (prev?.version ?? 0) + 1;
  const supersedesId = prev?.id ?? null;

  const ext = file.name.split(".").pop() ?? "bin";
  const safeBase = title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  const storagePath = `${projectId}/${safeBase}__v${version}__${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("documents")
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 400 },
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      title,
      description: description || null,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      version,
      uploaded_by: user.id,
      supersedes_id: supersedesId,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // Clean up orphaned storage object.
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json(
      { error: insertErr?.message ?? "insert failed" },
      { status: 400 },
    );
  }

  await supabase.from("audit_log").insert({
    project_id: projectId,
    actor_id: user.id,
    action: "document.upload",
    entity_type: "document",
    entity_id: inserted.id,
    payload: {
      title,
      size: file.size,
      version,
    },
  });

  // Fire off notifications to every project member (excl. uploader).
  notifyMembers({
    projectId,
    docId: inserted.id,
    uploaderId: user.id,
    title,
  }).catch((err) => console.warn("[documents] notify failed", err));

  return NextResponse.json({ ok: true, id: inserted.id, version });
}

async function notifyMembers(args: {
  projectId: string;
  docId: string;
  uploaderId: string;
  title: string;
}) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", args.projectId);
  const { data: staff } = await admin
    .from("users")
    .select("id")
    .in("role", ["cme_admin", "cme_viewer"]);

  const userIds = new Set<string>();
  for (const m of members ?? []) userIds.add(m.user_id);
  for (const s of staff ?? []) userIds.add(s.id);
  userIds.delete(args.uploaderId);

  if (userIds.size === 0) return;

  await admin.from("notifications").insert(
    Array.from(userIds).map((uid) => ({
      user_id: uid,
      project_id: args.projectId,
      kind: "document.uploaded",
      entity_type: "document",
      entity_id: args.docId,
      payload: { title: args.title },
    })),
  );

  const { data: project } = await admin
    .from("projects")
    .select("slug, client_short, name")
    .eq("id", args.projectId)
    .maybeSingle();
  const { data: recipients } = await admin
    .from("users")
    .select("id, email, full_name")
    .in("id", Array.from(userIds));
  const { data: uploader } = await admin
    .from("users")
    .select("full_name, email")
    .eq("id", args.uploaderId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = project ? `${appUrl}/p/${project.slug}/documents` : appUrl;
  const uploaderLabel = uploader?.full_name ?? uploader?.email ?? "A user";

  for (const r of recipients ?? []) {
    await sendCmeEmail({
      to: r.email,
      subject: `New document on ${project?.client_short ?? "your project"}: ${args.title}`,
      heading: "NEW DOCUMENT",
      intro: `${uploaderLabel} added "${args.title}" to ${project?.name ?? "the project"} document library.`,
      cta: { label: "View document", url },
    });
  }
}
