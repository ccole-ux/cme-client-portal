"use client";

import type { CostAggregation } from "@/lib/costs/aggregate";
import { useCostFilters } from "@/hooks/useCostFilters";
import { CostBarChart, type Metric } from "./CostBarChart";

const PHASE_COLORS: Record<string, string> = {
  "1": "#25532E",
  "1.5": "#3C9D48",
  "2": "#4B5F9E",
  "3": "#9E3B58",
  PM: "#C7C8CA",
};

export function CrossFilterBars({
  byFirm,
  byResource,
  byPhase,
  byMonth,
  monthByPhase,
}: {
  byFirm: CostAggregation[];
  byResource: CostAggregation[];
  byPhase: CostAggregation[];
  byMonth: CostAggregation[];
  /** Per-month × per-phase breakdown for stacked Month chart */
  monthByPhase: Record<string, Record<string, { hours: number; cost: number }>>;
}) {
  const { filters, setFilter } = useCostFilters();

  const phaseKeys = Object.keys(PHASE_COLORS);
  const stackSegments = {
    keys: phaseKeys.map((k) => ({
      value: k,
      label: `Phase ${k}`,
      color: PHASE_COLORS[k],
    })),
    valueByKey: (
      row: CostAggregation,
      stackKey: string,
      metric: Metric,
    ) => {
      const cell = monthByPhase[row.key]?.[stackKey];
      if (!cell) return 0;
      return metric === "hours" ? cell.hours : cell.cost;
    },
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <CostBarChart
        title="By firm"
        aggregations={byFirm}
        selectedKeys={filters.firms}
        onBarClick={(k) => setFilter("firms", k)}
      />
      <CostBarChart
        title="By resource"
        description="Top 8"
        aggregations={byResource}
        selectedKeys={filters.resource_ids}
        onBarClick={(k) => setFilter("resource_ids", k)}
        truncateTo={8}
      />
      <CostBarChart
        title="By phase"
        aggregations={byPhase}
        selectedKeys={filters.phases}
        onBarClick={(k) => setFilter("phases", k)}
      />
      <CostBarChart
        title="By month"
        description="Stacked by phase"
        aggregations={byMonth}
        selectedKeys={filters.year_months}
        onBarClick={(k) => setFilter("year_months", k)}
        stackSegments={stackSegments}
      />
    </div>
  );
}
