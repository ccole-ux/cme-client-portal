import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Which fields on a given entity are locked because another user submitted a
 * draft touching them that is still awaiting CME Admin review.
 *
 * Locked fields render a yellow lock glyph in the UI and disable inline edits
 * for non-admins. CME Admins can still edit but get a confirm modal first
 * (handled in the UI, not here).
 */
export type FieldLock = {
  field: string;
  submissionId: string;
  proposedChangeId: string;
  submittedByName: string | null;
  submittedByEmail: string | null;
  submittedAt: string;
  oldValue: unknown;
  newValue: unknown;
};

/**
 * Bulk lookup: returns a map of entity_id -> array of FieldLock for every
 * pending (status='submitted') proposed_change in the given project that
 * targets the given entity_type. One round-trip covers an entire project's
 * worth of task rows, which is what we need on the Gantt and tasks list.
 */
export async function loadPendingLocksForProject(
  supabase: SupabaseClient<Database>,
  projectId: string,
  entityType: "workplan_task" | "task_dependency" | "deliverable" | "narrative_section",
): Promise<Map<string, FieldLock[]>> {
  type ChangeRow = {
    id: string;
    entity_id: string | null;
    submission_id: string | null;
    proposed_at: string;
    change_data: Record<string, unknown>;
    proposed_by: string;
    users: { full_name: string | null; email: string } | null;
  };

  const { data, error } = await supabase
    .from("proposed_changes")
    .select(
      "id, entity_id, submission_id, proposed_at, change_data, proposed_by, users:users!proposed_changes_proposed_by_fkey(full_name, email)",
    )
    .eq("project_id", projectId)
    .eq("entity_type", entityType)
    .eq("status", "submitted");

  if (error || !data) return new Map();

  const out = new Map<string, FieldLock[]>();
  for (const row of data as unknown as ChangeRow[]) {
    if (!row.entity_id || !row.submission_id) continue;
    const list = out.get(row.entity_id) ?? [];
    const cd = row.change_data ?? {};
    for (const [field, value] of Object.entries(cd)) {
      // change_data for updates is `{ field: { old, new } }`. Only pull pairs
      // that look like our draft shape; skip foreign metadata keys.
      if (
        typeof value === "object" &&
        value !== null &&
        ("new" in (value as Record<string, unknown>) ||
          "old" in (value as Record<string, unknown>))
      ) {
        const v = value as { old?: unknown; new?: unknown };
        list.push({
          field,
          submissionId: row.submission_id,
          proposedChangeId: row.id,
          submittedByName: row.users?.full_name ?? null,
          submittedByEmail: row.users?.email ?? null,
          submittedAt: row.proposed_at,
          oldValue: v.old,
          newValue: v.new,
        });
      }
    }
    out.set(row.entity_id, list);
  }
  return out;
}

/**
 * Flatten a locks-by-entity map to a set of locked "entityId:field" keys —
 * used by the Gantt drag handler to short-circuit without an extra fetch.
 */
export function lockedFieldKeySet(
  locksByEntity: Map<string, FieldLock[]>,
): Set<string> {
  const s = new Set<string>();
  for (const [entityId, locks] of locksByEntity) {
    for (const l of locks) {
      s.add(`${entityId}:${l.field}`);
    }
  }
  return s;
}
