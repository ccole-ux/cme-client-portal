"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TaskResourceRow } from "@/lib/costs/aggregate";

export type CostFilters = {
  firms: string[];
  resource_ids: string[];
  phases: string[];
  year_months: string[];
};

export type CostFilterDimension = keyof CostFilters;

// URL params: ?firm=CME&firm=DAVTEQ · ?phase=1 · ?resource=<uuid> · ?month=2026-08
const PARAM_MAP: Record<CostFilterDimension, string> = {
  firms: "firm",
  resource_ids: "resource",
  phases: "phase",
  year_months: "month",
};

export function useCostFilters(): {
  filters: CostFilters;
  setFilter: (dimension: CostFilterDimension, value: string) => void;
  clearAll: () => void;
  isFiltered: boolean;
  filterRows: (rows: TaskResourceRow[]) => TaskResourceRow[];
  activeChips: { dimension: CostFilterDimension; value: string }[];
} {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const filters = useMemo<CostFilters>(() => {
    return {
      firms: search.getAll("firm"),
      resource_ids: search.getAll("resource"),
      phases: search.getAll("phase"),
      year_months: search.getAll("month"),
    };
  }, [search]);

  const isFiltered =
    filters.firms.length > 0 ||
    filters.resource_ids.length > 0 ||
    filters.phases.length > 0 ||
    filters.year_months.length > 0;

  const activeChips = useMemo(() => {
    const chips: { dimension: CostFilterDimension; value: string }[] = [];
    for (const v of filters.firms) chips.push({ dimension: "firms", value: v });
    for (const v of filters.resource_ids)
      chips.push({ dimension: "resource_ids", value: v });
    for (const v of filters.phases)
      chips.push({ dimension: "phases", value: v });
    for (const v of filters.year_months)
      chips.push({ dimension: "year_months", value: v });
    return chips;
  }, [filters]);

  const replaceSearch = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    (dimension: CostFilterDimension, value: string) => {
      const paramKey = PARAM_MAP[dimension];
      const next = new URLSearchParams(search.toString());
      const current = next.getAll(paramKey);
      next.delete(paramKey);
      if (current.includes(value)) {
        for (const v of current) if (v !== value) next.append(paramKey, v);
      } else {
        for (const v of current) next.append(paramKey, v);
        next.append(paramKey, value);
      }
      replaceSearch(next);
    },
    [search, replaceSearch],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(search.toString());
    for (const k of Object.values(PARAM_MAP)) next.delete(k);
    replaceSearch(next);
  }, [search, replaceSearch]);

  const filterRows = useCallback(
    (rows: TaskResourceRow[]) => {
      if (!isFiltered) return rows;
      return rows.filter((r) => {
        if (
          filters.firms.length > 0 &&
          !filters.firms.includes(r.firm)
        ) {
          return false;
        }
        if (
          filters.resource_ids.length > 0 &&
          !filters.resource_ids.includes(r.resource_id)
        ) {
          return false;
        }
        if (
          filters.phases.length > 0 &&
          !filters.phases.includes(r.phase ?? "PM")
        ) {
          return false;
        }
        if (filters.year_months.length > 0) {
          const overlaps = filters.year_months.some((ym) =>
            taskOverlapsMonth(r.start_date, r.finish_date, ym),
          );
          if (!overlaps) return false;
        }
        return true;
      });
    },
    [filters, isFiltered],
  );

  return { filters, setFilter, clearAll, isFiltered, filterRows, activeChips };
}

function taskOverlapsMonth(
  startISO: string,
  finishISO: string,
  yearMonth: string,
): boolean {
  const monthStart = `${yearMonth}-01`;
  const [y, m] = yearMonth.split("-").map(Number);
  const nextMonthStart = `${y + (m === 12 ? 1 : 0)}-${m === 12 ? "01" : pad(m + 1)}-01`;
  // Overlap if task.start < nextMonthStart AND task.finish >= monthStart
  return startISO < nextMonthStart && finishISO >= monthStart;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
