import { describe, it, expect } from "vitest";
import {
  buildCostSummary,
  CONTRACT_BASELINE_COST,
  CONTRACT_BASELINE_HOURS,
} from "./summary";
import type { TaskResourceRow } from "./aggregate";
import type { RateHistoryRow } from "@/lib/rates/compute";

const RATES: RateHistoryRow[] = [
  {
    id: "r1",
    resource_id: "cole",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    rate_loaded: 407.04,
    rate_source: "B7 R26-003 2026",
  },
  {
    id: "r2",
    resource_id: "cole",
    effective_from: "2027-01-01",
    effective_to: "2027-12-31",
    rate_loaded: 419.25,
    rate_source: "Calendar 2027 +3%",
  },
];

function row(overrides: Partial<TaskResourceRow>): TaskResourceRow {
  return {
    task_id: "t1",
    wbs: "1.1.1",
    task_name: "Task",
    phase: "1",
    start_date: "2026-05-01",
    finish_date: "2026-05-31",
    resource_id: "cole",
    resource_name: "Chris Cole",
    firm: "CME (Prime)",
    hours: 10,
    is_milestone: false,
    ...overrides,
  };
}

describe("buildCostSummary", () => {
  it("returns the hard-coded contract baseline constants", () => {
    expect(CONTRACT_BASELINE_COST).toBe(1_356_256);
    expect(CONTRACT_BASELINE_HOURS).toBe(4_912);
  });

  it("surfaces contract baseline, live forecast, and delta in one object", () => {
    // Single 10hr 2026-only task at $407.04/hr = $4070.40 forecast
    const rows = [row({ hours: 10 })];
    const summary = buildCostSummary(rows, RATES);
    expect(summary.contract_baseline).toBe(1_356_256);
    expect(summary.forecast_escalated).toBeCloseTo(4070.4, 2);
    expect(summary.escalation_delta).toBeCloseTo(
      4070.4 - 1_356_256,
      2,
    );
    expect(summary.escalation_delta_pct).toBeCloseTo(
      (4070.4 - 1_356_256) / 1_356_256,
      6,
    );
    expect(summary.total_hours).toBe(10);
  });

  it("forecast reflects 3% escalation for 2027 work", () => {
    // 100 hours fully in 2027 = 100 * $419.25 = $41,925
    const rows = [
      row({
        hours: 100,
        start_date: "2027-06-01",
        finish_date: "2027-06-30",
      }),
    ];
    const summary = buildCostSummary(rows, RATES);
    expect(summary.forecast_escalated).toBeCloseTo(41_925, 1);
  });

  it("delta is exactly forecast - baseline (no rounding)", () => {
    const rows = [row({ hours: 123 })];
    const summary = buildCostSummary(rows, RATES);
    expect(summary.escalation_delta).toBe(
      summary.forecast_escalated - summary.contract_baseline,
    );
  });
});
