import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PostSchema = z.object({
  project_id: z.string().uuid(),
  label: z.string().min(1).max(200),
});

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
  if (profile?.role !== "cme_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("capture_manual_snapshot", {
    p_project_id: parsed.data.project_id,
    p_label: parsed.data.label,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase.from("audit_log").insert({
    project_id: parsed.data.project_id,
    actor_id: user.id,
    action: "snapshot.manual_capture",
    entity_type: "workplan_snapshot",
    entity_id: typeof data === "string" ? data : null,
    payload: { label: parsed.data.label },
  });

  return NextResponse.json({ ok: true, id: data });
}
