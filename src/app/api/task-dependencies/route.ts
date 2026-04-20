import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PostSchema = z.object({
  project_id: z.string().uuid(),
  predecessor_task_id: z.string().uuid(),
  successor_task_id: z.string().uuid(),
  dependency_type: z
    .enum([
      "finish_to_start",
      "start_to_start",
      "finish_to_finish",
      "start_to_finish",
    ])
    .default("finish_to_start"),
  lag_days: z.number().int().default(0),
  notes: z.string().optional(),
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
    return NextResponse.json(
      { error: "Only CME admins can add dependencies directly." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.predecessor_task_id === parsed.data.successor_task_id) {
    return NextResponse.json(
      { error: "A task can't depend on itself" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("task_dependencies").insert({
    project_id: parsed.data.project_id,
    predecessor_task_id: parsed.data.predecessor_task_id,
    successor_task_id: parsed.data.successor_task_id,
    dependency_type: parsed.data.dependency_type,
    lag_days: parsed.data.lag_days,
    notes: parsed.data.notes,
    created_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
