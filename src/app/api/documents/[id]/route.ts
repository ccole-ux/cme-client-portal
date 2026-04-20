import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, project_id, title, storage_path, version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60);
  if (error || !signed) {
    return NextResponse.json(
      { error: error?.message ?? "signing failed" },
      { status: 500 },
    );
  }

  await supabase.from("audit_log").insert({
    project_id: doc.project_id,
    actor_id: user.id,
    action: "document.download",
    entity_type: "document",
    entity_id: doc.id,
    payload: { version: doc.version },
  });

  return NextResponse.json({
    url: signed.signedUrl,
    filename: `${doc.title.replace(/[^a-z0-9]+/gi, "_")}_v${doc.version}`,
  });
}
