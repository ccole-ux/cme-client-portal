import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RateHistoryRow } from "@/lib/rates/compute";
import type {
  TaskResourceRow,
  MonthlyBreakdownRow,
  BurnPoint,
  CostAggregation,
} from "@/lib/costs/aggregate";
import {
  aggregateByFirm,
  aggregateByMonth,
  aggregateByPhase,
  aggregateByResource,
  buildMonthlyBreakdown,
  computeBaselineBurn,
} from "@/lib/costs/aggregate";
import type { MilestoneMarker } from "@/components/costs/CumulativeBurn";

export type CostFilterInput = {
  firms: string[];
  resource_ids: string[];
  phases: string[];
  year_months: string[];
};

export async function loadCostData(
  projectId: string,
  projectStartISO: string,
  projectEndISO: string,
  filters: CostFilterInput,
): Promise<{
  filteredRows: TaskResourceRow[];
  rates: RateHistoryRow[];
  byFirm: CostAggregation[];
  byResource: CostAggregation[];
  byPhase: CostAggregation[];
  byMonth: CostAggregation[];
  breakdown: MonthlyBreakdownRow[];
  monthByPhase: Record<string, Record<string, { hours: number; cost: number }>>;
  burn: BurnPoint[];
  milestones: MilestoneMarker[];
  firmOrder: string[];
  resourceOrder: { id: string; name: string }[];
  resourceNameById: Record<string, string>;
  allRowsTotalCost: number;
}> {
  const supabase = await createClient();

  const [wtrRes, ratesRes, tasksRes] = await Promise.all([
    supabase
      .from("workplan_task_resources")
      .select(
        "id, hours, task_id, resource_id, workplan_tasks!inner(wbs, task_name, phase, start_date, finish_date, project_id, is_milestone), resources!inner(full_name, firm)",
      )
      .eq("workplan_tasks.project_id", projectId),
    supabase
      .from("resource_rate_history")
      .select("*"),
    supabase
      .from("workplan_tasks")
      .select("id, wbs, task_name, finish_date, is_milestone")
      .eq("project_id", projectId)
      .eq("is_milestone", true)
      .order("finish_date"),
  ]);

  if (wtrRes.error) throw wtrRes.error;
  if (ratesRes.error) throw ratesRes.error;
  if (tasksRes.error) throw tasksRes.error;

  type WtrJoin = {
    hours: number;
    task_id: string;
    resource_id: string;
    workplan_tasks: {
      wbs: string;
      task_name: string;
      phase: string | null;
      start_date: string | null;
      finish_date: string | null;
      is_milestone: boolean;
    };
    resources: { full_name: string; firm: string };
  };

  const allRows: TaskResourceRow[] = (
    wtrRes.data as unknown as WtrJoin[]
  )
    .filter(
      (w) =>
        w.workplan_tasks.start_date && w.workplan_tasks.finish_date,
    )
    .map((w) => ({
      task_id: w.task_id,
      wbs: w.workplan_tasks.wbs,
      task_name: w.workplan_tasks.task_name,
      phase: w.workplan_tasks.phase,
      start_date: w.workplan_tasks.start_date!,
      finish_date: w.workplan_tasks.finish_date!,
      resource_id: w.resource_id,
      resource_name: w.resources.full_name,
      firm: w.resources.firm,
      hours: Number(w.hours),
      is_milestone: w.workplan_tasks.is_milestone,
    }));

  const rates: RateHistoryRow[] = (ratesRes.data ?? []).map((r) => ({
    id: r.id,
    resource_id: r.resource_id,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    rate_loaded: Number(r.rate_loaded),
    rate_source: r.rate_source ?? "",
  }));

  // Build lookup sets used by multiple aggregations
  const firmSet = new Set<string>();
  const resourceMap = new Map<string, string>();
  for (const r of allRows) {
    firmSet.add(r.firm);
    resourceMap.set(r.resource_id, r.resource_name);
  }
  const firmOrder = [...firmSet].sort();
  const resourceOrder = [...resourceMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const resourceNameById = Object.fromEntries(resourceMap);

  // Apply filters
  const filteredRows = applyFilters(allRows, filters);

  // Aggregations (filtered)
  const byFirm = aggregateByFirm(filteredRows, rates);
  const byResource = aggregateByResource(filteredRows, rates);
  const byPhase = aggregateByPhase(filteredRows, rates);
  const byMonth = aggregateByMonth(filteredRows, rates);
  const breakdown = buildMonthlyBreakdown(
    filteredRows,
    rates,
    projectStartISO,
    projectEndISO,
  );

  // Month × phase stacked data for the Month chart
  const monthByPhase: Record<
    string,
    Record<string, { hours: number; cost: number }>
  > = {};
  for (const row of breakdown) {
    const perPhase: Record<string, { hours: number; cost: number }> = {};
    for (const phase of ["1", "1.5", "2", "3", "PM"]) {
      perPhase[phase] = {
        hours: row.hours_by_phase[phase] ?? 0,
        cost: row.cost_by_phase[phase] ?? 0,
      };
    }
    monthByPhase[row.year_month] = perPhase;
  }

  // Burn always from the FULL (unfiltered) rows per spec §5 burn chart note
  const burn = computeBaselineBurn(
    allRows,
    rates,
    projectStartISO,
    projectEndISO,
    "week",
  );

  // Milestone markers: each milestone's cumulative position on the burn curve
  const milestones: MilestoneMarker[] = [];
  for (const m of tasksRes.data ?? []) {
    if (!m.finish_date) continue;
    // Find the burn point on or just after this milestone's date.
    const idx = burn.findIndex((p) => p.date >= m.finish_date!);
    const point = idx >= 0 ? burn[idx] : burn[burn.length - 1];
    milestones.push({
      wbs: m.wbs,
      label: m.task_name,
      date: m.finish_date,
      cumulative_cost: point.planned_cumulative_cost,
      cumulative_hours: point.planned_cumulative_hours,
    });
  }

  const allRowsTotalCost = aggregateByFirm(allRows, rates).reduce(
    (s, a) => s + a.cost,
    0,
  );

  return {
    filteredRows,
    rates,
    byFirm,
    byResource,
    byPhase,
    byMonth,
    breakdown,
    monthByPhase,
    burn,
    milestones,
    firmOrder,
    resourceOrder,
    resourceNameById,
    allRowsTotalCost,
  };
}

function applyFilters(
  rows: TaskResourceRow[],
  filters: CostFilterInput,
): TaskResourceRow[] {
  const hasFilters =
    filters.firms.length > 0 ||
    filters.resource_ids.length > 0 ||
    filters.phases.length > 0 ||
    filters.year_months.length > 0;
  if (!hasFilters) return rows;
  return rows.filter((r) => {
    if (filters.firms.length > 0 && !filters.firms.includes(r.firm)) return false;
    if (
      filters.resource_ids.length > 0 &&
      !filters.resource_ids.includes(r.resource_id)
    )
      return false;
    if (
      filters.phases.length > 0 &&
      !filters.phases.includes(r.phase ?? "PM")
    )
      return false;
    if (filters.year_months.length > 0) {
      const overlaps = filters.year_months.some((ym) =>
        overlapsMonth(r.start_date, r.finish_date, ym),
      );
      if (!overlaps) return false;
    }
    return true;
  });
}

function overlapsMonth(
  startISO: string,
  finishISO: string,
  yearMonth: string,
): boolean {
  const [y, m] = yearMonth.split("-").map(Number);
  const monthStart = `${yearMonth}-01`;
  const nextYm =
    m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return startISO < nextYm && finishISO >= monthStart;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
