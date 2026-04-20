"use client";

import type { CostAggregation } from "@/lib/costs/aggregate";
import { useCostFilters } from "@/hooks/useCostFilters";
import { CostBarChart } from "./CostBarChart";

export function CrossFilterBars({
  byFirm,
  byResource,
  byPhase,
  byMonth,
}: {
  byFirm: CostAggregation[];
  byResource: CostAggregation[];
  byPhase: CostAggregation[];
  byMonth: CostAggregation[];
  /** Kept in the type for source-compat; stacking was removed so the 2027
   *  months read consistently against the 2026 months. */
  monthByPhase?: Record<string, Record<string, { hours: number; cost: number }>>;
}) {
  const { filters, setFilter } = useCostFilters();

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
        aggregations={byMonth}
        selectedKeys={filters.year_months}
        onBarClick={(k) => setFilter("year_months", k)}
      />
    </div>
  );
}
