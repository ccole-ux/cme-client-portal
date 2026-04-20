"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCostFilters,
  type CostFilterDimension,
} from "@/hooks/useCostFilters";

const DIMENSION_LABEL: Record<CostFilterDimension, string> = {
  firms: "Firm",
  resource_ids: "Resource",
  phases: "Phase",
  year_months: "Month",
};

export function ActiveFilterPills({
  resourceNameById,
}: {
  resourceNameById: Record<string, string>;
}) {
  const { activeChips, setFilter, clearAll, isFiltered } = useCostFilters();
  if (!isFiltered) return null;

  function displayValue(
    dimension: CostFilterDimension,
    value: string,
  ): string {
    if (dimension === "resource_ids") {
      return resourceNameById[value] ?? value;
    }
    if (dimension === "year_months") {
      const [y, m] = value.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1, 1));
      return d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    if (dimension === "phases") return `Phase ${value}`;
    return value;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] tracking-widest uppercase text-muted-foreground">
        Filters
      </span>
      {activeChips.map((chip) => (
        <button
          key={`${chip.dimension}:${chip.value}`}
          type="button"
          onClick={() => setFilter(chip.dimension, chip.value)}
          className="inline-flex items-center gap-1 rounded-full border bg-cme-bright-green/10 px-2.5 py-0.5 text-xs text-cme-dark-green hover:bg-cme-bright-green/20"
        >
          <span className="font-medium">
            {DIMENSION_LABEL[chip.dimension]}:
          </span>
          <span>{displayValue(chip.dimension, chip.value)}</span>
          <XIcon className="h-3 w-3" />
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        className="ml-auto h-7 text-xs"
      >
        Clear all
      </Button>
    </div>
  );
}
