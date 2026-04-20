import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  const projectIds = Array.from(
    new Set((notifications ?? []).map((n) => n.project_id).filter(Boolean)),
  ) as string[];

  const projects =
    projectIds.length > 0
      ? (
          await supabase
            .from("projects")
            .select("id, slug, client_short")
            .in("id", projectIds)
        ).data ?? []
      : [];

  return NextResponse.json({
    items: notifications ?? [],
    projects,
  });
}

export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase
    .from("notifications")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("seen_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
