import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Delete a single draft proposed_change. RLS restricts DELETE on drafts to the
 * proposer (pc_update_own_draft covers UPDATE; DELETE of own draft is allowed
 * via SELECT + author check here). CME Admin can also delete via pc_admin_write.
 */
export async function DELETE(
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

  // Verify this is a draft owned by the caller (or the caller is CME Admin).
  const { data: row, error: fetchErr } = await supabase
    .from("proposed_changes")
    .select("id, status, proposed_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "draft") {
    return NextResponse.json(
      { error: "Can only delete drafts that are not yet submitted." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("proposed_changes")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
