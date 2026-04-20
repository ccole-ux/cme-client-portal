"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { MonthlyBreakdownRow } from "@/lib/costs/aggregate";
import { useCostFilters } from "@/hooks/useCostFilters";
import { formatCurrency } from "@/lib/status";

type GroupBy = "phase" | "firm" | "resource";
type Metric = "hours" | "cost";

const PHASE_ORDER = ["1", "1.5", "2", "3", "PM"];

export function MonthlyBreakdownTable({
  breakdown,
  firmOrder,
  resourceOrder,
}: {
  breakdown: MonthlyBreakdownRow[];
  firmOrder: string[];
  resourceOrder: { id: string; name: string }[];
}) {
  const { filters, setFilter } = useCostFilters();
  const [groupBy, setGroupBy] = useState<GroupBy>("phase");
  const [metric, setMetric] = useState<Metric>("cost");

  const columns = useMemo(() => {
    if (groupBy === "phase") {
      return PHASE_ORDER.filter((p) =>
        breakdown.some(
          (b) =>
            (b.hours_by_phase[p] ?? 0) > 0 ||
            (b.cost_by_phase[p] ?? 0) > 0,
        ),
      ).map((p) => ({ key: p, label: `Phase ${p}`, dimension: "phase" as const }));
    }
    if (groupBy === "firm") {
      return firmOrder.map((f) => ({
        key: f,
        label: f,
        dimension: "firm" as const,
      }));
    }
    return resourceOrder.map((r) => ({
      key: r.name,
      label: r.name,
      dimension: "resource" as const,
    }));
  }, [groupBy, breakdown, firmOrder, resourceOrder]);

  function cellValue(row: MonthlyBreakdownRow, col: (typeof columns)[number]) {
    const map =
      groupBy === "phase"
        ? metric === "hours"
          ? row.hours_by_phase
          : row.cost_by_phase
        : groupBy === "firm"
          ? metric === "hours"
            ? row.hours_by_firm
            : row.cost_by_firm
          : metric === "hours"
            ? row.hours_by_resource
            : row.cost_by_resource;
    return map[col.key] ?? 0;
  }

  function totalValue(row: MonthlyBreakdownRow) {
    return metric === "hours" ? row.total_hours : row.total_cost;
  }

  function formatVal(v: number) {
    if (v === 0) return "—";
    if (metric === "cost") return formatCurrency(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function handleCellClick(
    row: MonthlyBreakdownRow,
    col: (typeof columns)[number],
  ) {
    setFilter("year_months", row.year_month);
    if (col.dimension === "phase") setFilter("phases", col.key);
    else if (col.dimension === "firm") setFilter("firms", col.key);
    // resource would need id, skip for now
  }

  const grandTotal = breakdown.reduce((s, r) => s + totalValue(r), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display tracking-wide text-sm">
              MONTHLY BREAKDOWN
            </CardTitle>
            <CardDescription className="text-xs">
              Click a cell to add a month + {groupBy} filter pair.
            </CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList>
                <TabsTrigger value="hours">Hours</TabsTrigger>
                <TabsTrigger value="cost">Dollars</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <TabsList>
                <TabsTrigger value="phase">By phase</TabsTrigger>
                <TabsTrigger value="firm">By firm</TabsTrigger>
                <TabsTrigger value="resource">By resource</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className="text-right whitespace-nowrap"
                  >
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((row) => {
                const total = totalValue(row);
                return (
                  <TableRow key={row.year_month}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {row.label}
                    </TableCell>
                    {columns.map((c) => {
                      const v = cellValue(row, c);
                      const active =
                        filters.year_months.includes(row.year_month) &&
                        ((c.dimension === "phase" &&
                          filters.phases.includes(c.key)) ||
                          (c.dimension === "firm" &&
                            filters.firms.includes(c.key)));
                      return (
                        <TableCell
                          key={c.key}
                          className={cn(
                            "text-right tabular-nums cursor-pointer hover:bg-muted/50",
                            active &&
                              "bg-cme-bright-green/15 text-cme-dark-green font-semibold",
                            v === 0 && "text-muted-foreground",
                          )}
                          onClick={() => handleCellClick(row, c)}
                        >
                          {formatVal(v)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">
                      {formatVal(total)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>Total</TableCell>
                {columns.map((c) => {
                  const colTotal = breakdown.reduce(
                    (s, r) => s + cellValue(r, c),
                    0,
                  );
                  return (
                    <TableCell
                      key={c.key}
                      className="text-right tabular-nums"
                    >
                      {formatVal(colTotal)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right tabular-nums">
                  {formatVal(grandTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
