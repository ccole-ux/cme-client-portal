import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type DraftEntityRef = {
  id: string | null;
  label: string;
  sub: string | null;
};

export type DraftRow = {
  id: string;
  operation: "create" | "update" | "delete";
  entity_type: string;
  entity_id: string | null;
  change_data: Record<string, unknown>;
  created_at: string;
  entity: DraftEntityRef;
};

export async function getDraftsForUser(
  projectId: string,
  userId: string,
): Promise<DraftRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposed_changes")
    .select(
      "id, operation, entity_type, entity_id, change_data, proposed_at",
    )
    .eq("project_id", projectId)
    .eq("proposed_by", userId)
    .eq("status", "draft")
    .order("proposed_at", { ascending: false });

  if (error || !data) return [];

  // Resolve entity labels in one pass. For workplan_task edits we pull the
  // task's WBS + name; for task_dependency rows we show the linked task pair.
  const taskIds = new Set<string>();
  const depPredIds = new Set<string>();
  const depSuccIds = new Set<string>();

  for (const row of data) {
    if (row.entity_type === "workplan_task" && row.entity_id) {
      taskIds.add(row.entity_id);
    }
    if (row.entity_type === "task_dependency") {
      const cd = row.change_data as Record<string, unknown>;
      const p = cd.predecessor_task_id;
      const s = cd.successor_task_id;
      if (typeof p === "string") depPredIds.add(p);
      if (typeof s === "string") depSuccIds.add(s);
    }
  }

  const relatedTaskIds = new Set<string>([
    ...taskIds,
    ...depPredIds,
    ...depSuccIds,
  ]);

  const tasks = relatedTaskIds.size
    ? await loadTasks(supabase, Array.from(relatedTaskIds))
    : new Map<string, { wbs: string; task_name: string }>();

  return data.map((row) => ({
    id: row.id,
    operation: row.operation,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    change_data: row.change_data as Record<string, unknown>,
    created_at: row.proposed_at,
    entity: resolveEntity(row, tasks),
  }));
}

async function loadTasks(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, { wbs: string; task_name: string }>> {
  const { data } = await supabase
    .from("workplan_tasks")
    .select("id, wbs, task_name")
    .in("id", ids);
  const out = new Map<string, { wbs: string; task_name: string }>();
  for (const t of data ?? []) {
    out.set(t.id, { wbs: t.wbs, task_name: t.task_name });
  }
  return out;
}

function resolveEntity(
  row: {
    entity_type: string;
    entity_id: string | null;
    change_data: unknown;
    operation: string;
  },
  tasks: Map<string, { wbs: string; task_name: string }>,
): DraftEntityRef {
  if (row.entity_type === "workplan_task") {
    const t = row.entity_id ? tasks.get(row.entity_id) : null;
    if (t) {
      return {
        id: row.entity_id,
        label: t.task_name,
        sub: t.wbs,
      };
    }
    return { id: row.entity_id, label: "New task", sub: null };
  }
  if (row.entity_type === "task_dependency") {
    const cd = row.change_data as Record<string, unknown>;
    const pred = typeof cd.predecessor_task_id === "string"
      ? tasks.get(cd.predecessor_task_id)
      : null;
    const succ = typeof cd.successor_task_id === "string"
      ? tasks.get(cd.successor_task_id)
      : null;
    const predLabel = pred ? `${pred.wbs} ${pred.task_name}` : "?";
    const succLabel = succ ? `${succ.wbs} ${succ.task_name}` : "?";
    return {
      id: row.entity_id,
      label: `${predLabel} → ${succLabel}`,
      sub: "Dependency",
    };
  }
  return { id: row.entity_id, label: row.entity_type, sub: null };
}

export function summarizeChange(
  operation: string,
  change_data: Record<string, unknown>,
): { field: string; old: string; new: string }[] {
  if (operation === "create") {
    return Object.entries(change_data)
      .slice(0, 4)
      .map(([field, v]) => ({
        field,
        old: "—",
        new: stringify(v),
      }));
  }
  if (operation === "delete") {
    return [{ field: "—", old: "kept", new: "removed" }];
  }
  return Object.entries(change_data)
    .filter(
      ([, v]) =>
        typeof v === "object" &&
        v !== null &&
        ("old" in (v as Record<string, unknown>) ||
          "new" in (v as Record<string, unknown>)),
    )
    .map(([field, v]) => {
      const diff = v as { old?: unknown; new?: unknown };
      return {
        field,
        old: stringify(diff.old),
        new: stringify(diff.new),
      };
    });
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function countDraftsForUser(
  projectId: string,
  userId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("proposed_changes")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("proposed_by", userId)
    .eq("status", "draft");
  return count ?? 0;
}

export async function countPendingSubmissionsForProject(
  projectId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("change_submissions")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "pending_review");
  return count ?? 0;
}
