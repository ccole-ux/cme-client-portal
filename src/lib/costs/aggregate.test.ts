import { describe, it, expect } from "vitest";
import {
  aggregateByFirm,
  aggregateByMonth,
  aggregateByPhase,
  aggregateByResource,
  buildMonthlyBreakdown,
  computeBaselineBurn,
  type TaskResourceRow,
} from "./aggregate";
import type { RateHistoryRow } from "@/lib/rates/compute";

const COLE_ID = "cole";
const NASSAYAN_ID = "nassayan";

const RATES: RateHistoryRow[] = [
  // Cole — CME rate schedule
  {
    id: "r1",
    resource_id: COLE_ID,
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    rate_loaded: 407.04,
    rate_source: "B7 R26-003 2026",
  },
  {
    id: "r2",
    resource_id: COLE_ID,
    effective_from: "2027-01-01",
    effective_to: "2027-12-31",
    rate_loaded: 419.25,
    rate_source: "Calendar 2027 +3%",
  },
  // Nassayan — SQL & Sightline
  {
    id: "r3",
    resource_id: NASSAYAN_ID,
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    rate_loaded: 260.0,
    rate_source: "B7 R26-003 2026",
  },
  {
    id: "r4",
    resource_id: NASSAYAN_ID,
    effective_from: "2027-01-01",
    effective_to: "2027-12-31",
    rate_loaded: 267.8,
    rate_source: "Calendar 2027 +3%",
  },
];

function mkRow(overrides: Partial<TaskResourceRow>): TaskResourceRow {
  return {
    task_id: "t1",
    wbs: "1.1.1",
    task_name: "Test task",
    phase: "1",
    start_date: "2026-08-01",
    finish_date: "2026-08-10",
    resource_id: COLE_ID,
    resource_name: "Chris Cole",
    firm: "CME (Prime)",
    hours: 40,
    is_milestone: false,
    ...overrides,
  };
}

describe("aggregateByFirm", () => {
  it("sums hours and cost correctly; totals match sum of rows", () => {
    const rows: TaskResourceRow[] = [
      mkRow({ task_id: "t1", hours: 40 }),
      mkRow({
        task_id: "t2",
        resource_id: NASSAYAN_ID,
        resource_name: "Tom Nassayan",
        firm: "SQL & Sightline",
        hours: 60,
      }),
      mkRow({ task_id: "t3", hours: 20 }),
    ];
    const agg = aggregateByFirm(rows, RATES);
    expect(agg).toHaveLength(2);

    const cme = agg.find((a) => a.key === "CME (Prime)")!;
    expect(cme.hours).toBe(60);
    expect(cme.cost).toBeCloseTo(60 * 407.04, 2);
    expect(cme.task_ids).toEqual(["t1", "t3"]);

    const sql = agg.find((a) => a.key === "SQL & Sightline")!;
    expect(sql.hours).toBe(60);
    expect(sql.cost).toBeCloseTo(60 * 260, 2);

    const total = agg.reduce((s, a) => s + a.cost, 0);
    const expectedTotal = 60 * 407.04 + 60 * 260;
    expect(total).toBeCloseTo(expectedTotal, 2);
  });
});

describe("aggregateByResource", () => {
  it("groups by resource_id and labels by resource_name", () => {
    const rows = [
      mkRow({ hours: 10 }),
      mkRow({ task_id: "t2", hours: 20 }),
    ];
    const agg = aggregateByResource(rows, RATES);
    expect(agg).toHaveLength(1);
    expect(agg[0].key).toBe(COLE_ID);
    expect(agg[0].label).toBe("Chris Cole");
    expect(agg[0].hours).toBe(30);
  });
});

describe("aggregateByPhase", () => {
  it("groups by phase and sorts in canonical order", () => {
    const rows = [
      mkRow({ phase: "2", hours: 10 }),
      mkRow({ phase: "1", hours: 30 }),
      mkRow({ phase: "PM", hours: 5 }),
      mkRow({ phase: "1.5", hours: 15 }),
      mkRow({ phase: "3", hours: 8 }),
    ];
    const agg = aggregateByPhase(rows, RATES);
    expect(agg.map((a) => a.key)).toEqual(["1", "1.5", "2", "3", "PM"]);
  });
});

describe("aggregateByMonth", () => {
  it("splits a task spanning Aug-Sep proportionally by calendar days", () => {
    // Task Aug 20 → Sep 10 (22 days total): 12 days in Aug, 10 days in Sep
    const rows = [
      mkRow({
        start_date: "2026-08-20",
        finish_date: "2026-09-10",
        hours: 22,
      }),
    ];
    const agg = aggregateByMonth(rows, RATES);
    expect(agg).toHaveLength(2);
    const aug = agg.find((a) => a.key === "2026-08")!;
    const sep = agg.find((a) => a.key === "2026-09")!;
    expect(aug.hours).toBeCloseTo(22 * (12 / 22), 6);
    expect(sep.hours).toBeCloseTo(22 * (10 / 22), 6);
    expect(aug.hours + sep.hours).toBeCloseTo(22, 6);
  });

  it("splits a task crossing Dec/Jan at the rate boundary", () => {
    // Cole: 2026 $407.04, 2027 $419.25
    // Task Dec 20 2026 → Jan 10 2027 (22 days total): 12 days Dec + 10 days Jan
    const rows = [
      mkRow({
        start_date: "2026-12-20",
        finish_date: "2027-01-10",
        hours: 22,
      }),
    ];
    const agg = aggregateByMonth(rows, RATES);
    const dec = agg.find((a) => a.key === "2026-12")!;
    const jan = agg.find((a) => a.key === "2027-01")!;
    expect(dec.hours).toBeCloseTo(22 * (12 / 22), 6);
    expect(jan.hours).toBeCloseTo(22 * (10 / 22), 6);
    // Dec days use 2026 rate; Jan days use 2027 rate
    expect(dec.cost).toBeCloseTo(12 * 407.04, 2);
    expect(jan.cost).toBeCloseTo(10 * 419.25, 2);
  });

  it("covers every month a long task spans", () => {
    const rows = [
      mkRow({
        start_date: "2026-05-01",
        finish_date: "2027-04-30",
        hours: 365,
      }),
    ];
    const agg = aggregateByMonth(rows, RATES);
    // May 2026 through April 2027 inclusive = 12 months
    expect(agg).toHaveLength(12);
  });
});

describe("buildMonthlyBreakdown", () => {
  it("emits a row per month from start to end", () => {
    const rows: TaskResourceRow[] = [];
    const breakdown = buildMonthlyBreakdown(
      rows,
      RATES,
      "2026-05-01",
      "2027-04-30",
    );
    expect(breakdown).toHaveLength(12);
    expect(breakdown[0].year_month).toBe("2026-05");
    expect(breakdown[11].year_month).toBe("2027-04");
  });

  it("distributes a cross-month task across phase/firm/resource dimensions", () => {
    // 20-hour Cole task Aug 20 → Sep 10 (12 days Aug / 10 days Sep of 22 total)
    const rows = [
      mkRow({
        start_date: "2026-08-20",
        finish_date: "2026-09-10",
        hours: 22,
        phase: "1",
      }),
    ];
    const b = buildMonthlyBreakdown(rows, RATES, "2026-08-01", "2026-09-30");
    const aug = b[0];
    const sep = b[1];
    expect(aug.hours_by_phase["1"]).toBeCloseTo(22 * (12 / 22), 6);
    expect(aug.hours_by_firm["CME (Prime)"]).toBeCloseTo(12, 6);
    expect(aug.hours_by_resource["Chris Cole"]).toBeCloseTo(12, 6);
    expect(aug.total_hours).toBeCloseTo(12, 6);
    expect(sep.total_hours).toBeCloseTo(10, 6);
    expect(aug.total_cost + sep.total_cost).toBeCloseTo(22 * 407.04, 2);
  });

  it("sums across phase dimensions correctly when multiple rows overlap", () => {
    const rows = [
      mkRow({ phase: "1", hours: 10, start_date: "2026-08-01", finish_date: "2026-08-10" }),
      mkRow({
        task_id: "t2",
        phase: "2",
        hours: 20,
        start_date: "2026-08-05",
        finish_date: "2026-08-15",
      }),
    ];
    const b = buildMonthlyBreakdown(rows, RATES, "2026-08-01", "2026-08-31");
    expect(b[0].hours_by_phase["1"]).toBeCloseTo(10, 6);
    expect(b[0].hours_by_phase["2"]).toBeCloseTo(20, 6);
    expect(b[0].total_hours).toBeCloseTo(30, 6);
  });
});

describe("computeBaselineBurn", () => {
  it("starts at 0 and is monotonically non-decreasing", () => {
    const rows = [
      mkRow({ start_date: "2026-05-01", finish_date: "2026-05-10", hours: 40 }),
    ];
    const burn = computeBaselineBurn(
      rows,
      RATES,
      "2026-05-01",
      "2026-05-15",
      "week",
    );
    expect(burn[0].planned_cumulative_cost).toBe(0);
    expect(burn[0].planned_cumulative_hours).toBe(0);
    for (let i = 1; i < burn.length; i++) {
      expect(burn[i].planned_cumulative_cost).toBeGreaterThanOrEqual(
        burn[i - 1].planned_cumulative_cost,
      );
      expect(burn[i].planned_cumulative_hours).toBeGreaterThanOrEqual(
        burn[i - 1].planned_cumulative_hours,
      );
    }
  });

  it("last point equals total cost across all rows", () => {
    const rows = [
      mkRow({ start_date: "2026-05-01", finish_date: "2026-05-10", hours: 40 }),
      mkRow({
        task_id: "t2",
        start_date: "2026-05-01",
        finish_date: "2026-05-20",
        hours: 60,
        resource_id: NASSAYAN_ID,
        resource_name: "Tom Nassayan",
        firm: "SQL & Sightline",
      }),
    ];
    const burn = computeBaselineBurn(
      rows,
      RATES,
      "2026-05-01",
      "2026-05-31",
      "week",
    );
    const last = burn[burn.length - 1];
    const expected = 40 * 407.04 + 60 * 260;
    expect(last.planned_cumulative_cost).toBeCloseTo(expected, 0);
  });

  it("respects rate boundary in the cumulative curve", () => {
    // Single Cole task that spans the Dec 31 / Jan 1 rate change
    const rows = [
      mkRow({
        start_date: "2026-12-20",
        finish_date: "2027-01-10",
        hours: 22,
      }),
    ];
    const burn = computeBaselineBurn(
      rows,
      RATES,
      "2026-12-01",
      "2027-01-31",
      "week",
    );
    const last = burn[burn.length - 1];
    const expected = 12 * 407.04 + 10 * 419.25;
    expect(last.planned_cumulative_cost).toBeCloseTo(expected, 0);
  });
});
