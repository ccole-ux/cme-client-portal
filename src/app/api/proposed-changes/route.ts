import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["proposed_changes"]["Insert"]["change_data"];

const PostSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
  entity_type: z.enum([
    "workplan_task",
    "task_dependency",
    "deliverable",
    "narrative_section",
  ]),
  entity_id: z.string().uuid().nullable().optional(),
  change_data: z.record(z.string(), z.unknown()),
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

  // Resolve project_id from the referenced entity so RLS is_project_member()
  // succeeds. For entity_type=workplan_task we look up the task; for
  // task_dependency the client supplies it in change_data.
  let projectId: string | null = null;
  if (parsed.data.entity_type === "workplan_task" && parsed.data.entity_id) {
    const { data: task } = await supabase
      .from("workplan_tasks")
      .select("project_id")
      .eq("id", parsed.data.entity_id)
      .maybeSingle();
    projectId = task?.project_id ?? null;
  } else if (parsed.data.entity_type === "task_dependency") {
    const pid = parsed.data.change_data["project_id"];
    projectId = typeof pid === "string" ? pid : null;
  }
  if (!projectId) {
    return NextResponse.json(
      { error: "Unable to resolve project for change" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("proposed_changes")
    .insert({
      project_id: projectId,
      operation: parsed.data.operation,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id ?? null,
      change_data: parsed.data.change_data as Json,
      proposed_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
