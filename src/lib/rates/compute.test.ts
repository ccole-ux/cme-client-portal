import { describe, it, expect } from "vitest";
import {
  computeCostForTaskResource,
  generateEscalatedRates,
} from "./compute";

const RATES = [
  {
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    rate_loaded: 407.04,
    rate_source: "B7 R26-003 2026",
  },
  {
    effective_from: "2027-01-01",
    effective_to: "2027-12-31",
    rate_loaded: 419.25,
    rate_source: "Calendar 2027 +3%",
  },
  {
    effective_from: "2028-01-01",
    effective_to: "2028-12-31",
    rate_loaded: 431.83,
    rate_source: "Calendar 2028 +3%",
  },
];

describe("computeCostForTaskResource", () => {
  it("task entirely in 2026 — single period", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2026-05-01",
        finish_date: "2026-05-31",
        hours: 40,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].year).toBe(2026);
    expect(r.breakdown[0].rate).toBe(407.04);
    expect(r.breakdown[0].period_days).toBe(31);
    expect(r.total_cost).toBeCloseTo(40 * 407.04, 2);
    expect(r.total_hours).toBeCloseTo(40, 6);
  });

  it("task entirely in 2027 — single period at escalated rate", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2027-03-01",
        finish_date: "2027-03-31",
        hours: 20,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].rate).toBe(419.25);
    expect(r.total_cost).toBeCloseTo(20 * 419.25, 2);
  });

  it("task spanning 2026/2027 boundary — two periods prorated by days (PM.1 pattern)", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2026-05-01",
        finish_date: "2027-04-30",
        hours: 68,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown[0].period_days).toBe(245);
    expect(r.breakdown[1].period_days).toBe(120);
    expect(
      r.breakdown[0].period_days + r.breakdown[1].period_days,
    ).toBe(365);
    expect(r.breakdown[0].period_hours).toBeCloseTo(
      (68 * 245) / 365,
      6,
    );
    expect(r.breakdown[1].period_hours).toBeCloseTo(
      (68 * 120) / 365,
      6,
    );
    const expected =
      ((68 * 245) / 365) * 407.04 + ((68 * 120) / 365) * 419.25;
    expect(r.total_cost).toBeCloseTo(expected, 2);
    expect(r.total_cost).toBeGreaterThan(27500);
    expect(r.total_cost).toBeLessThan(28500);
    expect(r.total_hours).toBeCloseTo(68, 6);
  });

  it("task spanning three rate years — compounding escalation", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2026-07-01",
        finish_date: "2028-06-30",
        hours: 100,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(3);
    const [b1, b2, b3] = r.breakdown;
    expect(b1.year).toBe(2026);
    expect(b2.year).toBe(2027);
    expect(b3.year).toBe(2028);
    // 2026-07-01 -> 2026-12-31 = 184 days
    // 2027 full = 365 days
    // 2028-01-01 -> 2028-06-30 = 182 days (leap year; Jan 31 + Feb 29 + Mar 31 + Apr 30 + May 31 + Jun 30 = 182)
    expect(b1.period_days).toBe(184);
    expect(b2.period_days).toBe(365);
    expect(b3.period_days).toBe(182);
    expect(b1.period_days + b2.period_days + b3.period_days).toBe(
      731,
    );
    expect(r.total_hours).toBeCloseTo(100, 6);
  });

  it("leap year 2028 has 366 days — full-year single-period task", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2028-01-01",
        finish_date: "2028-12-31",
        hours: 200,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].period_days).toBe(366);
    expect(r.breakdown[0].rate).toBe(431.83);
    expect(r.total_cost).toBeCloseTo(200 * 431.83, 2);
  });

  it("single-day task — no division by zero", () => {
    const r = computeCostForTaskResource(
      {
        start_date: "2026-06-15",
        finish_date: "2026-06-15",
        hours: 4,
      },
      RATES,
    );
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].period_days).toBe(1);
    expect(r.total_hours).toBeCloseTo(4, 6);
    expect(r.total_cost).toBeCloseTo(4 * 407.04, 2);
  });

  it("throws when rate history gaps the task range", () => {
    const gapped = [RATES[0]];
    expect(() =>
      computeCostForTaskResource(
        {
          start_date: "2026-11-01",
          finish_date: "2027-03-31",
          hours: 10,
        },
        gapped,
      ),
    ).toThrow(/does not cover/);
  });
});

describe("generateEscalatedRates", () => {
  it("generates 3 rows for 2026 -> 2028 at Cole baseline 407.04", () => {
    const rows = generateEscalatedRates(
      407.04,
      2026,
      2028,
      "B7 R26-003 2026",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
      rate_loaded: 407.04,
      rate_source: "B7 R26-003 2026",
    });
    expect(rows[1].rate_loaded).toBeCloseTo(419.25, 2);
    expect(rows[1].rate_source).toBe("Calendar 2027 +3%");
    expect(rows[2].rate_loaded).toBeCloseTo(431.83, 2);
    expect(rows[2].rate_source).toBe("Calendar 2028 +3%");
  });

  it("matches cents precision for other B7 baseline rates", () => {
    // Brown 217.80 -> 224.33 -> 231.06
    const rows = generateEscalatedRates(
      217.8,
      2026,
      2028,
      "B7 R26-003 2026",
    );
    expect(rows[1].rate_loaded).toBeCloseTo(224.33, 2);
    expect(rows[2].rate_loaded).toBeCloseTo(231.06, 2);

    // Mortazavi 278.30 -> 286.65 -> 295.25
    const mort = generateEscalatedRates(
      278.3,
      2026,
      2028,
      "B7 R26-003 2026",
    );
    expect(mort[1].rate_loaded).toBeCloseTo(286.65, 2);
    expect(mort[2].rate_loaded).toBeCloseTo(295.25, 2);
  });
});
