import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  type Row = {
    user_id: string;
    users: { full_name: string | null; email: string } | null;
  };

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, users:users!project_members_user_id_fkey(full_name, email)")
    .eq("project_id", id);

  const { data: staff } = await supabase
    .from("users")
    .select("id, full_name, email")
    .in("role", ["cme_admin", "cme_viewer"]);

  const items = new Map<string, { user_id: string; full_name: string | null; email: string }>();
  for (const m of (members ?? []) as unknown as Row[]) {
    if (!m.users) continue;
    items.set(m.user_id, {
      user_id: m.user_id,
      full_name: m.users.full_name,
      email: m.users.email,
    });
  }
  for (const s of staff ?? []) {
    if (items.has(s.id)) continue;
    items.set(s.id, {
      user_id: s.id,
      full_name: s.full_name,
      email: s.email,
    });
  }

  return NextResponse.json({ items: Array.from(items.values()) });
}
