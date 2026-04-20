/**
 * Cost summary — reconciles the signed contract baseline (flat 2026 rates)
 * against the rate-engine-derived forecast (3% Jan 1 2027 escalation applied
 * to 2027 work). Shown side-by-side so the client never sees a "surprise"
 * delta on the cost dashboard.
 *
 * `CONTRACT_BASELINE_*` constants are deliberately hard-coded — they are the
 * R26-003 contract figures the parties signed, not a computed value. Do not
 * recompute them from rates.
 */
import { aggregateByFirm, type TaskResourceRow } from "./aggregate";
import type { RateHistoryRow } from "@/lib/rates/compute";

export const CONTRACT_BASELINE_COST = 1_356_256;
export const CONTRACT_BASELINE_HOURS = 4_912;

export type CostSummary = {
  /** Signed contract figure at flat 2026 rates. Always the constant above. */
  contract_baseline: number;
  /** Live rate-engine total across all task-resource rows. */
  forecast_escalated: number;
  /** forecast_escalated - contract_baseline */
  escalation_delta: number;
  /** (forecast_escalated - contract_baseline) / contract_baseline */
  escalation_delta_pct: number;
  /** Total baseline hours across all task-resource rows. */
  total_hours: number;
};

export function buildCostSummary(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
): CostSummary {
  const firms = aggregateByFirm(rows, rates);
  const forecast = firms.reduce((s, a) => s + a.cost, 0);
  const hours = firms.reduce((s, a) => s + a.hours, 0);
  const delta = forecast - CONTRACT_BASELINE_COST;
  return {
    contract_baseline: CONTRACT_BASELINE_COST,
    forecast_escalated: forecast,
    escalation_delta: delta,
    escalation_delta_pct: delta / CONTRACT_BASELINE_COST,
    total_hours: hours,
  };
}
