import { differenceInCalendarDays, parseISO } from "date-fns";

export type RateHistoryRow = {
  id?: string;
  resource_id?: string;
  effective_from: string;
  effective_to: string | null;
  rate_loaded: number;
  rate_source: string;
};

export type TaskResource = {
  start_date: string;
  finish_date: string;
  hours: number;
};

export type CostPeriodBreakdown = {
  year: number;
  period_start: string;
  period_end: string;
  period_days: number;
  period_hours: number;
  rate: number;
  period_cost: number;
  rate_source: string;
};

export type CostComputation = {
  total_cost: number;
  total_hours: number;
  breakdown: CostPeriodBreakdown[];
};

function inclusiveDays(startISO: string, endISO: string): number {
  return (
    differenceInCalendarDays(parseISO(endISO), parseISO(startISO)) + 1
  );
}

function isBeforeISO(a: string, b: string): boolean {
  return parseISO(a) < parseISO(b);
}

function maxISO(a: string, b: string): string {
  return isBeforeISO(a, b) ? b : a;
}

function minISO(a: string, b: string): string {
  return isBeforeISO(a, b) ? a : b;
}

export function computeCostForTaskResource(
  task: TaskResource,
  rateHistory: RateHistoryRow[],
): CostComputation {
  const { start_date, finish_date, hours } = task;
  if (!start_date || !finish_date) {
    throw new Error("Task must have start_date and finish_date");
  }
  const totalTaskDays = inclusiveDays(start_date, finish_date);
  if (totalTaskDays <= 0) {
    throw new Error(
      `Invalid task dates: ${start_date} -> ${finish_date}`,
    );
  }

  const sorted = [...rateHistory].sort((a, b) =>
    a.effective_from < b.effective_from
      ? -1
      : a.effective_from > b.effective_from
        ? 1
        : 0,
  );

  const breakdown: CostPeriodBreakdown[] = [];
  let coveredDays = 0;

  for (const row of sorted) {
    const rateFrom = row.effective_from;
    const rateTo = row.effective_to ?? "9999-12-31";

    if (isBeforeISO(rateTo, start_date)) continue;
    if (isBeforeISO(finish_date, rateFrom)) continue;

    const periodStart = maxISO(start_date, rateFrom);
    const periodEnd = minISO(finish_date, rateTo);
    const periodDays = inclusiveDays(periodStart, periodEnd);
    if (periodDays <= 0) continue;

    const periodHours = hours * (periodDays / totalTaskDays);
    const periodCost = periodHours * row.rate_loaded;

    breakdown.push({
      year: parseISO(periodStart).getFullYear(),
      period_start: periodStart,
      period_end: periodEnd,
      period_days: periodDays,
      period_hours: periodHours,
      rate: row.rate_loaded,
      period_cost: periodCost,
      rate_source: row.rate_source,
    });
    coveredDays += periodDays;
  }

  if (coveredDays < totalTaskDays) {
    throw new Error(
      `Rate history does not cover full task range ${start_date} -> ${finish_date} ` +
        `(covered ${coveredDays}/${totalTaskDays} days)`,
    );
  }

  return {
    total_cost: breakdown.reduce((s, b) => s + b.period_cost, 0),
    total_hours: breakdown.reduce((s, b) => s + b.period_hours, 0),
    breakdown,
  };
}

export type EscalatedRateRow = {
  effective_from: string;
  effective_to: string;
  rate_loaded: number;
  rate_source: string;
};

export function generateEscalatedRates(
  baselineRate: number,
  baselineYear: number,
  throughYear: number,
  baselineSource: string,
): EscalatedRateRow[] {
  const rows: EscalatedRateRow[] = [];
  for (let year = baselineYear; year <= throughYear; year++) {
    const yearsFromBase = year - baselineYear;
    const rate =
      Math.round(baselineRate * Math.pow(1.03, yearsFromBase) * 100) /
      100;
    const source =
      yearsFromBase === 0 ? baselineSource : `Calendar ${year} +3%`;
    rows.push({
      effective_from: `${year}-01-01`,
      effective_to: `${year}-12-31`,
      rate_loaded: rate,
      rate_source: source,
    });
  }
  return rows;
}
