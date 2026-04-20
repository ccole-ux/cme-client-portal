import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  computeCostForTaskResource,
  type RateHistoryRow,
} from "@/lib/rates/compute";
import type { TaskStatus } from "@/lib/status";

function resolveCurrentRate(
  rates: RateHistoryRow[],
  iso: string,
): number | null {
  for (const r of rates) {
    const from = r.effective_from;
    const to = r.effective_to ?? "9999-12-31";
    if (from <= iso && iso <= to) return r.rate_loaded;
  }
  return null;
}

function distributeAcrossMonths(
  startISO: string,
  endISO: string,
  hours: number,
  cost: number,
  byMonth: Map<string, { hours: number; cost: number }>,
): void {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );

  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  while (cursor <= end) {
    const monthStart = cursor.getTime() < start.getTime() ? start : cursor;
    const nextMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    const monthEndCapped =
      nextMonth.getTime() - 86_400_000 > end.getTime()
        ? end
        : new Date(nextMonth.getTime() - 86_400_000);
    const days =
      Math.round(
        (monthEndCapped.getTime() - monthStart.getTime()) / 86_400_000,
      ) + 1;
    if (days > 0) {
      const frac = days / totalDays;
      const y = cursor.getUTCFullYear();
      const m = (cursor.getUTCMonth() + 1).toString().padStart(2, "0");
      const key = `${y}-${m}`;
      const curr = byMonth.get(key) ?? { hours: 0, cost: 0 };
      curr.hours += hours * frac;
      curr.cost += cost * frac;
      byMonth.set(key, curr);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

export type ExportTaskRow = {
  id: string;
  wbs: string;
  task_name: string;
  phase: string | null;
  start_date: string | null;
  finish_date: string | null;
  is_milestone: boolean;
  status: TaskStatus;
  notes: string | null;
  sort_order: number;
  total_hours: number;
  total_cost: number;
  assignments: Array<{
    resource_id: string;
    resource_name: string;
    firm: string;
    hours: number;
    rate_year: number | null;
    rate: number | null;
    cost: number;
  }>;
};

export type ExportWorkplan = {
  project: {
    id: string;
    slug: string;
    name: string;
    client_name: string;
    client_short: string;
    baseline_year: number;
    kickoff_on: string | null;
    target_complete_on: string | null;
  };
  versionLabel: string;
  versionSubtitle: string;
  generatedAt: string;
  tasks: ExportTaskRow[];
  totals: {
    hours: number;
    cost: number;
    byFirm: Record<string, { hours: number; cost: number }>;
    byPhase: Record<string, { hours: number; cost: number }>;
    byMonth: Array<{ month: string; hours: number; cost: number }>;
  };
  resources: Array<{
    id: string;
    full_name: string;
    firm: string;
    role_description: string | null;
    current_rate: number | null;
  }>;
  rateHistory: Array<{
    resource_name: string;
    firm: string;
    effective_from: string;
    effective_to: string | null;
    rate_loaded: number;
    rate_source: string | null;
  }>;
  narrative: Array<{
    title: string;
    body_markdown: string;
  }>;
};

/**
 * Load canonical workplan data for the current, live state of a project.
 */
export async function loadCanonicalWorkplan(
  supabase: SupabaseClient<Database>,
  projectId: string,
  versionLabel = "Canonical Baseline",
): Promise<ExportWorkplan> {
  const [projectRes, tasksRes, wtrRes, ratesRes, resourcesRes, narrativeRes] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase
        .from("workplan_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("workplan_task_resources")
        .select("*, resource:resources(*), workplan_tasks!inner(project_id)")
        .eq("workplan_tasks.project_id", projectId),
      supabase.from("resource_rate_history").select("*").order("effective_from"),
      supabase.from("resources").select("*").order("full_name"),
      supabase
        .from("narrative_sections")
        .select("title, body_markdown")
        .eq("project_id", projectId)
        .eq("is_published", true)
        .order("sort_order"),
    ]);

  const project = projectRes.data;
  if (!project) throw new Error("Project not found");

  type RateRow = Database["public"]["Tables"]["resource_rate_history"]["Row"];
  type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
  type WtrRow = Database["public"]["Tables"]["workplan_task_resources"]["Row"];

  const ratesByResource = new Map<string, RateHistoryRow[]>();
  for (const r of (ratesRes.data ?? []) as RateRow[]) {
    const list = ratesByResource.get(r.resource_id) ?? [];
    list.push({
      id: r.id,
      resource_id: r.resource_id,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      rate_loaded: Number(r.rate_loaded),
      rate_source: r.rate_source ?? "",
    });
    ratesByResource.set(r.resource_id, list);
  }

  const wtrByTask = new Map<
    string,
    Array<WtrRow & { resource: ResourceRow | null }>
  >();
  for (const row of (wtrRes.data ?? []) as unknown as Array<
    WtrRow & { resource: ResourceRow | null }
  >) {
    const list = wtrByTask.get(row.task_id) ?? [];
    list.push(row);
    wtrByTask.set(row.task_id, list);
  }

  const byFirm: Record<string, { hours: number; cost: number }> = {};
  const byPhase: Record<string, { hours: number; cost: number }> = {};
  const byMonth = new Map<string, { hours: number; cost: number }>();
  let grandHours = 0;
  let grandCost = 0;

  const tasks: ExportTaskRow[] = [];
  for (const t of tasksRes.data ?? []) {
    const assignments = wtrByTask.get(t.id) ?? [];
    const rowAssignments: ExportTaskRow["assignments"] = [];
    let taskHours = 0;
    let taskCost = 0;

    for (const a of assignments) {
      const rates = ratesByResource.get(a.resource_id) ?? [];
      const hours = Number(a.hours);
      taskHours += hours;
      grandHours += hours;

      let cost = 0;
      let rateYear: number | null = null;
      let rate: number | null = null;
      if (t.start_date && t.finish_date) {
        try {
          const c = computeCostForTaskResource(
            {
              start_date: t.start_date,
              finish_date: t.finish_date,
              hours,
            },
            rates,
          );
          cost = c.total_cost;
          if (c.breakdown.length > 0) {
            rateYear = new Date(c.breakdown[0].period_start).getUTCFullYear();
            rate = c.breakdown[0].rate;
          }

          // Monthly rollup. Spread each breakdown period's hours+cost
          // proportionally by its overlap with each month it touches. Accurate
          // enough for the cost summary shown in exports.
          for (const p of c.breakdown) {
            distributeAcrossMonths(
              p.period_start,
              p.period_end,
              p.period_hours,
              p.period_cost,
              byMonth,
            );
          }
        } catch {
          // rate missing; leave zero
        }
      }
      taskCost += cost;
      grandCost += cost;

      const firm = a.resource?.firm ?? "Unknown";
      const firmRow = byFirm[firm] ?? { hours: 0, cost: 0 };
      firmRow.hours += hours;
      firmRow.cost += cost;
      byFirm[firm] = firmRow;

      const phaseKey = t.phase ?? "OTHER";
      const pRow = byPhase[phaseKey] ?? { hours: 0, cost: 0 };
      pRow.hours += hours;
      pRow.cost += cost;
      byPhase[phaseKey] = pRow;

      rowAssignments.push({
        resource_id: a.resource_id,
        resource_name: a.resource?.full_name ?? "Unknown",
        firm,
        hours,
        rate_year: rateYear,
        rate,
        cost,
      });
    }

    tasks.push({
      id: t.id,
      wbs: t.wbs,
      task_name: t.task_name,
      phase: t.phase,
      start_date: t.start_date,
      finish_date: t.finish_date,
      is_milestone: t.is_milestone,
      status: t.status,
      notes: t.notes ?? null,
      sort_order: t.sort_order,
      total_hours: taskHours,
      total_cost: taskCost,
      assignments: rowAssignments,
    });
  }

  const monthsSorted = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, hours: v.hours, cost: v.cost }));

  // Resources with current rate (as of today).
  const today = new Date().toISOString().slice(0, 10);
  const resources: ExportWorkplan["resources"] = (resourcesRes.data ?? []).map(
    (r: ResourceRow) => {
      const rates = ratesByResource.get(r.id) ?? [];
      return {
        id: r.id,
        full_name: r.full_name,
        firm: r.firm,
        role_description: r.role_description ?? null,
        current_rate: resolveCurrentRate(rates, today),
      };
    },
  );

  // Full rate history.
  const resourceById = new Map<string, ResourceRow>();
  for (const r of (resourcesRes.data ?? []) as ResourceRow[]) {
    resourceById.set(r.id, r);
  }
  const rateHistory: ExportWorkplan["rateHistory"] = (
    (ratesRes.data ?? []) as RateRow[]
  ).map((r) => ({
    resource_name: resourceById.get(r.resource_id)?.full_name ?? "Unknown",
    firm: resourceById.get(r.resource_id)?.firm ?? "",
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    rate_loaded: Number(r.rate_loaded),
    rate_source: r.rate_source ?? null,
  }));

  return {
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      client_name: project.client_name,
      client_short: project.client_short,
      baseline_year: project.baseline_year,
      kickoff_on: project.kickoff_on,
      target_complete_on: project.target_complete_on,
    },
    versionLabel,
    versionSubtitle: `Generated ${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    tasks,
    totals: {
      hours: grandHours,
      cost: grandCost,
      byFirm,
      byPhase,
      byMonth: monthsSorted,
    },
    resources,
    rateHistory,
    narrative: narrativeRes.data ?? [],
  };
}

/**
 * Rebuild an ExportWorkplan from a frozen workplan_snapshots.data payload.
 * Used for submission + version downloads.
 */
export async function loadWorkplanFromSnapshot(
  supabase: SupabaseClient<Database>,
  snapshotRow: {
    project_id: string;
    snapshot_type: string;
    snapshot_label: string | null;
    version_number: number;
    captured_at: string;
    data: unknown;
    narrative_data: unknown;
  },
): Promise<ExportWorkplan> {
  type SnapshotData = {
    tasks?: Array<Database["public"]["Tables"]["workplan_tasks"]["Row"]>;
    task_resources?: Array<
      Database["public"]["Tables"]["workplan_task_resources"]["Row"]
    >;
    dependencies?: unknown[];
  };
  const data = (snapshotRow.data ?? {}) as SnapshotData;

  const [projectRes, ratesRes, resourcesRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", snapshotRow.project_id)
      .maybeSingle(),
    supabase.from("resource_rate_history").select("*"),
    supabase.from("resources").select("*"),
  ]);
  const project = projectRes.data;
  if (!project) throw new Error("Project not found");

  type RateRow = Database["public"]["Tables"]["resource_rate_history"]["Row"];
  type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];

  const ratesByResource = new Map<string, RateHistoryRow[]>();
  for (const r of (ratesRes.data ?? []) as RateRow[]) {
    const list = ratesByResource.get(r.resource_id) ?? [];
    list.push({
      id: r.id,
      resource_id: r.resource_id,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      rate_loaded: Number(r.rate_loaded),
      rate_source: r.rate_source ?? "",
    });
    ratesByResource.set(r.resource_id, list);
  }

  const resourceById = new Map<string, ResourceRow>();
  for (const r of (resourcesRes.data ?? []) as ResourceRow[]) {
    resourceById.set(r.id, r);
  }

  const wtrByTask = new Map<
    string,
    Array<Database["public"]["Tables"]["workplan_task_resources"]["Row"]>
  >();
  for (const w of data.task_resources ?? []) {
    const list = wtrByTask.get(w.task_id) ?? [];
    list.push(w);
    wtrByTask.set(w.task_id, list);
  }

  const byFirm: Record<string, { hours: number; cost: number }> = {};
  const byPhase: Record<string, { hours: number; cost: number }> = {};
  const byMonth = new Map<string, { hours: number; cost: number }>();
  let grandHours = 0;
  let grandCost = 0;

  const tasks: ExportTaskRow[] = [];
  for (const t of data.tasks ?? []) {
    const assignments = wtrByTask.get(t.id) ?? [];
    let taskHours = 0;
    let taskCost = 0;
    const rows: ExportTaskRow["assignments"] = [];
    for (const a of assignments) {
      const hours = Number(a.hours);
      taskHours += hours;
      grandHours += hours;
      const rates = ratesByResource.get(a.resource_id) ?? [];
      const resource = resourceById.get(a.resource_id);
      let cost = 0;
      let rateYear: number | null = null;
      let rate: number | null = null;
      if (t.start_date && t.finish_date) {
        try {
          const c = computeCostForTaskResource(
            { start_date: t.start_date, finish_date: t.finish_date, hours },
            rates,
          );
          cost = c.total_cost;
          if (c.breakdown.length > 0) {
            rateYear = new Date(c.breakdown[0].period_start).getUTCFullYear();
            rate = c.breakdown[0].rate;
          }
          for (const p of c.breakdown) {
            distributeAcrossMonths(
              p.period_start,
              p.period_end,
              p.period_hours,
              p.period_cost,
              byMonth,
            );
          }
        } catch {
          // missing
        }
      }
      taskCost += cost;
      grandCost += cost;
      const firm = resource?.firm ?? "Unknown";
      const f = byFirm[firm] ?? { hours: 0, cost: 0 };
      f.hours += hours;
      f.cost += cost;
      byFirm[firm] = f;
      const phaseKey = t.phase ?? "OTHER";
      const p = byPhase[phaseKey] ?? { hours: 0, cost: 0 };
      p.hours += hours;
      p.cost += cost;
      byPhase[phaseKey] = p;
      rows.push({
        resource_id: a.resource_id,
        resource_name: resource?.full_name ?? "Unknown",
        firm,
        hours,
        rate_year: rateYear,
        rate,
        cost,
      });
    }
    tasks.push({
      id: t.id,
      wbs: t.wbs,
      task_name: t.task_name,
      phase: t.phase,
      start_date: t.start_date,
      finish_date: t.finish_date,
      is_milestone: t.is_milestone,
      status: t.status,
      notes: t.notes ?? null,
      sort_order: t.sort_order,
      total_hours: taskHours,
      total_cost: taskCost,
      assignments: rows,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const resources: ExportWorkplan["resources"] = (resourcesRes.data ?? []).map(
    (r: ResourceRow) => {
      const rates = ratesByResource.get(r.id) ?? [];
      return {
        id: r.id,
        full_name: r.full_name,
        firm: r.firm,
        role_description: r.role_description ?? null,
        current_rate: resolveCurrentRate(rates, today),
      };
    },
  );

  const rateHistory: ExportWorkplan["rateHistory"] = (
    (ratesRes.data ?? []) as RateRow[]
  ).map((r) => ({
    resource_name: resourceById.get(r.resource_id)?.full_name ?? "Unknown",
    firm: resourceById.get(r.resource_id)?.firm ?? "",
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    rate_loaded: Number(r.rate_loaded),
    rate_source: r.rate_source ?? null,
  }));

  type NarrativeData = Array<{ title: string; body_markdown: string }>;
  const narrative = (snapshotRow.narrative_data as NarrativeData) ?? [];

  tasks.sort((a, b) => a.sort_order - b.sort_order);

  return {
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      client_name: project.client_name,
      client_short: project.client_short,
      baseline_year: project.baseline_year,
      kickoff_on: project.kickoff_on,
      target_complete_on: project.target_complete_on,
    },
    versionLabel:
      snapshotRow.snapshot_label ??
      `${snapshotRow.snapshot_type} v${snapshotRow.version_number}`,
    versionSubtitle: `${snapshotRow.snapshot_type === "submission" ? "Submission" : snapshotRow.snapshot_type === "accepted_version" ? "Accepted Version" : "Manual Snapshot"} · Captured ${snapshotRow.captured_at.slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    tasks,
    totals: {
      hours: grandHours,
      cost: grandCost,
      byFirm,
      byPhase,
      byMonth: Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, hours: v.hours, cost: v.cost })),
    },
    resources,
    rateHistory,
    narrative,
  };
}
