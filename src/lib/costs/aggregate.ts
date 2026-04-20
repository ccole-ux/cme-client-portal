/**
 * Cost aggregation layer for the dashboard. All monetary math goes through
 * computeCostForTaskResource so rate-year splits (3% Jan 1 escalation) are
 * honored everywhere — including monthly buckets that cross Dec/Jan.
 */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  computeCostForTaskResource,
  type RateHistoryRow,
} from "@/lib/rates/compute";

export type TaskResourceRow = {
  task_id: string;
  wbs: string;
  task_name: string;
  phase: string | null;
  start_date: string; // YYYY-MM-DD
  finish_date: string;
  resource_id: string;
  resource_name: string;
  firm: string;
  hours: number;
  is_milestone: boolean;
};

export type CostAggregation = {
  key: string;
  label: string;
  hours: number;
  cost: number;
  task_ids: string[];
  resource_ids: string[];
};

export type MonthlyBreakdownRow = {
  year_month: string; // YYYY-MM
  label: string;
  hours_by_phase: Record<string, number>;
  cost_by_phase: Record<string, number>;
  hours_by_firm: Record<string, number>;
  cost_by_firm: Record<string, number>;
  hours_by_resource: Record<string, number>;
  cost_by_resource: Record<string, number>;
  total_hours: number;
  total_cost: number;
};

export type BurnPoint = {
  date: string;
  planned_cumulative_cost: number;
  planned_cumulative_hours: number;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function groupRatesByResource(
  rates: RateHistoryRow[],
): Map<string, RateHistoryRow[]> {
  const map = new Map<string, RateHistoryRow[]>();
  for (const r of rates) {
    if (!r.resource_id) continue;
    const list = map.get(r.resource_id) ?? [];
    list.push(r);
    map.set(r.resource_id, list);
  }
  return map;
}

function rowTotalCost(
  row: TaskResourceRow,
  ratesByResource: Map<string, RateHistoryRow[]>,
): number {
  const rates = ratesByResource.get(row.resource_id) ?? [];
  if (rates.length === 0) return 0;
  try {
    return computeCostForTaskResource(
      {
        start_date: row.start_date,
        finish_date: row.finish_date,
        hours: row.hours,
      },
      rates,
    ).total_cost;
  } catch {
    return 0;
  }
}

function toISODay(d: Date): string {
  // Use format (local-timezone-aware) so it matches date-fns helpers like
  // startOfMonth / endOfMonth / addDays that also operate on local time.
  // Mixing local-tz dates with UTC-based formatting was causing slice
  // endpoints to land on the wrong side of Dec 31 / Jan 1.
  return format(d, "yyyy-MM-dd");
}

function rateForDate(
  rates: RateHistoryRow[],
  dayISO: string,
): number {
  for (const r of rates) {
    if (
      dayISO >= r.effective_from &&
      (r.effective_to === null || dayISO <= r.effective_to)
    ) {
      return r.rate_loaded;
    }
  }
  return 0;
}

// -----------------------------------------------------------------------------
// Single-dimension aggregation
// -----------------------------------------------------------------------------

function aggregateByKey(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
  keyFn: (r: TaskResourceRow) => { key: string; label: string } | null,
): CostAggregation[] {
  const ratesByResource = groupRatesByResource(rates);
  const groups = new Map<string, CostAggregation>();
  for (const row of rows) {
    const k = keyFn(row);
    if (!k) continue;
    const cost = rowTotalCost(row, ratesByResource);
    const g = groups.get(k.key) ?? {
      key: k.key,
      label: k.label,
      hours: 0,
      cost: 0,
      task_ids: [],
      resource_ids: [],
    };
    g.hours += row.hours;
    g.cost += cost;
    if (!g.task_ids.includes(row.task_id)) g.task_ids.push(row.task_id);
    if (!g.resource_ids.includes(row.resource_id)) {
      g.resource_ids.push(row.resource_id);
    }
    groups.set(k.key, g);
  }
  return [...groups.values()];
}

export function aggregateByFirm(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
): CostAggregation[] {
  return aggregateByKey(rows, rates, (r) => ({
    key: r.firm,
    label: r.firm,
  })).sort((a, b) => b.cost - a.cost);
}

export function aggregateByResource(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
): CostAggregation[] {
  return aggregateByKey(rows, rates, (r) => ({
    key: r.resource_id,
    label: r.resource_name,
  })).sort((a, b) => b.cost - a.cost);
}

export function aggregateByPhase(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
): CostAggregation[] {
  const order: Record<string, number> = {
    "1": 1,
    "1.5": 2,
    "2": 3,
    "3": 4,
    PM: 5,
  };
  return aggregateByKey(rows, rates, (r) => {
    const key = r.phase ?? "PM";
    return { key, label: `Phase ${key}` };
  }).sort((a, b) => (order[a.key] ?? 99) - (order[b.key] ?? 99));
}

export function aggregateByMonth(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
): CostAggregation[] {
  const ratesByResource = groupRatesByResource(rates);
  const groups = new Map<string, CostAggregation>();

  for (const row of rows) {
    const taskStart = parseISO(row.start_date);
    const taskEnd = parseISO(row.finish_date);
    const totalDays = differenceInCalendarDays(taskEnd, taskStart) + 1;
    if (totalDays <= 0) continue;
    const taskRates = ratesByResource.get(row.resource_id) ?? [];

    let cursor = startOfMonth(taskStart);
    while (cursor <= taskEnd) {
      const monthEnd = endOfMonth(cursor);
      const sliceStart = cursor > taskStart ? cursor : taskStart;
      const sliceEnd = monthEnd < taskEnd ? monthEnd : taskEnd;
      const sliceDays =
        differenceInCalendarDays(sliceEnd, sliceStart) + 1;
      if (sliceDays > 0) {
        const sliceHours = (row.hours * sliceDays) / totalDays;
        let sliceCost = 0;
        try {
          sliceCost = computeCostForTaskResource(
            {
              start_date: toISODay(sliceStart),
              finish_date: toISODay(sliceEnd),
              hours: sliceHours,
            },
            taskRates,
          ).total_cost;
        } catch {
          sliceCost = 0;
        }
        const key = format(cursor, "yyyy-MM");
        const g = groups.get(key) ?? {
          key,
          label: format(cursor, "MMM yyyy"),
          hours: 0,
          cost: 0,
          task_ids: [],
          resource_ids: [],
        };
        g.hours += sliceHours;
        g.cost += sliceCost;
        if (!g.task_ids.includes(row.task_id)) {
          g.task_ids.push(row.task_id);
        }
        if (!g.resource_ids.includes(row.resource_id)) {
          g.resource_ids.push(row.resource_id);
        }
        groups.set(key, g);
      }
      cursor = startOfMonth(addMonths(cursor, 1));
    }
  }

  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// -----------------------------------------------------------------------------
// Monthly breakdown table (multi-dimension per month)
// -----------------------------------------------------------------------------

export function buildMonthlyBreakdown(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
  startDate: string,
  endDate: string,
): MonthlyBreakdownRow[] {
  const ratesByResource = groupRatesByResource(rates);
  const breakdown: MonthlyBreakdownRow[] = [];
  const byKey = new Map<string, MonthlyBreakdownRow>();

  let cursor = startOfMonth(parseISO(startDate));
  const end = startOfMonth(parseISO(endDate));
  while (cursor <= end) {
    const row: MonthlyBreakdownRow = {
      year_month: format(cursor, "yyyy-MM"),
      label: format(cursor, "MMM yyyy"),
      hours_by_phase: {},
      cost_by_phase: {},
      hours_by_firm: {},
      cost_by_firm: {},
      hours_by_resource: {},
      cost_by_resource: {},
      total_hours: 0,
      total_cost: 0,
    };
    breakdown.push(row);
    byKey.set(row.year_month, row);
    cursor = startOfMonth(addMonths(cursor, 1));
  }

  for (const r of rows) {
    const taskStart = parseISO(r.start_date);
    const taskEnd = parseISO(r.finish_date);
    const totalDays = differenceInCalendarDays(taskEnd, taskStart) + 1;
    if (totalDays <= 0) continue;
    const taskRates = ratesByResource.get(r.resource_id) ?? [];
    const phase = r.phase ?? "PM";

    let c = startOfMonth(taskStart);
    while (c <= taskEnd) {
      const monthEnd = endOfMonth(c);
      const sliceStart = c > taskStart ? c : taskStart;
      const sliceEnd = monthEnd < taskEnd ? monthEnd : taskEnd;
      const sliceDays =
        differenceInCalendarDays(sliceEnd, sliceStart) + 1;
      if (sliceDays > 0) {
        const sliceHours = (r.hours * sliceDays) / totalDays;
        let sliceCost = 0;
        try {
          sliceCost = computeCostForTaskResource(
            {
              start_date: toISODay(sliceStart),
              finish_date: toISODay(sliceEnd),
              hours: sliceHours,
            },
            taskRates,
          ).total_cost;
        } catch {
          sliceCost = 0;
        }
        const key = format(c, "yyyy-MM");
        const m = byKey.get(key);
        if (m) {
          m.total_hours += sliceHours;
          m.total_cost += sliceCost;
          m.hours_by_phase[phase] =
            (m.hours_by_phase[phase] ?? 0) + sliceHours;
          m.cost_by_phase[phase] =
            (m.cost_by_phase[phase] ?? 0) + sliceCost;
          m.hours_by_firm[r.firm] =
            (m.hours_by_firm[r.firm] ?? 0) + sliceHours;
          m.cost_by_firm[r.firm] =
            (m.cost_by_firm[r.firm] ?? 0) + sliceCost;
          m.hours_by_resource[r.resource_name] =
            (m.hours_by_resource[r.resource_name] ?? 0) + sliceHours;
          m.cost_by_resource[r.resource_name] =
            (m.cost_by_resource[r.resource_name] ?? 0) + sliceCost;
        }
      }
      c = startOfMonth(addMonths(c, 1));
    }
  }

  return breakdown;
}

// -----------------------------------------------------------------------------
// Cumulative burn
// -----------------------------------------------------------------------------

export function computeBaselineBurn(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
  startDate: string,
  endDate: string,
  granularity: "day" | "week" | "month" = "week",
): BurnPoint[] {
  const ratesByResource = groupRatesByResource(rates);

  // Build a dense daily map of contributions across all task-resources.
  const daily = new Map<string, { hours: number; cost: number }>();
  for (const r of rows) {
    const ts = parseISO(r.start_date);
    const te = parseISO(r.finish_date);
    const totalDays = differenceInCalendarDays(te, ts) + 1;
    if (totalDays <= 0) continue;
    const hoursPerDay = r.hours / totalDays;
    const taskRates = ratesByResource.get(r.resource_id) ?? [];

    for (let i = 0; i < totalDays; i++) {
      const d = addDays(ts, i);
      const key = toISODay(d);
      const rate = rateForDate(taskRates, key);
      const existing = daily.get(key) ?? { hours: 0, cost: 0 };
      existing.hours += hoursPerDay;
      existing.cost += hoursPerDay * rate;
      daily.set(key, existing);
    }
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const points: BurnPoint[] = [
    {
      date: toISODay(start),
      planned_cumulative_hours: 0,
      planned_cumulative_cost: 0,
    },
  ];

  let cumHours = 0;
  let cumCost = 0;
  let dayIdx = 0;

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const c = daily.get(toISODay(d));
    if (c) {
      cumHours += c.hours;
      cumCost += c.cost;
    }
    dayIdx += 1;

    let emit = false;
    if (granularity === "day") {
      emit = true;
    } else if (granularity === "week") {
      emit = dayIdx % 7 === 0;
    } else {
      // month — emit at month boundary
      const next = addDays(d, 1);
      emit = next.getUTCMonth() !== d.getUTCMonth();
    }

    const isEnd = +d === +end;
    if (emit || isEnd) {
      const last = points[points.length - 1];
      const iso = toISODay(d);
      if (last.date !== iso) {
        points.push({
          date: iso,
          planned_cumulative_hours: cumHours,
          planned_cumulative_cost: cumCost,
        });
      }
    }
  }

  return points;
}
