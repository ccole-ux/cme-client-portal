"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CostAggregation } from "@/lib/costs/aggregate";
import { formatCurrency } from "@/lib/status";

export type Metric = "hours" | "cost";

export function CostBarChart({
  title,
  description,
  aggregations,
  selectedKeys,
  onBarClick,
  truncateTo,
  yAxisFormatter,
  stackSegments,
}: {
  title: string;
  description?: string;
  aggregations: CostAggregation[];
  selectedKeys: string[];
  onBarClick: (key: string) => void;
  truncateTo?: number;
  yAxisFormatter?: (v: number) => string;
  /**
   * When set, each bar is stacked by a sub-dimension. `keyGetter` returns the
   * stack key for each datum; the chart will render one `<Bar>` per observed
   * stack key with distinct colors.
   */
  stackSegments?: {
    keys: { value: string; label: string; color: string }[];
    valueByKey: (
      row: CostAggregation,
      stackKey: string,
      metric: Metric,
    ) => number;
  };
}) {
  const [metric, setMetric] = useState<Metric>("hours");

  const data = aggregations
    .slice(0, truncateTo)
    .map((a) => ({
      key: a.key,
      label: a.label,
      hours: a.hours,
      cost: a.cost,
      task_count: a.task_ids.length,
    }));

  function formatY(v: number) {
    if (yAxisFormatter) return yAxisFormatter(v);
    if (metric === "cost") {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1000) return `$${Math.round(v / 1000)}k`;
      return `$${Math.round(v)}`;
    }
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display tracking-wide text-sm">
              {title.toUpperCase()}
            </CardTitle>
            {description && (
              <CardDescription className="text-xs">
                {description}
              </CardDescription>
            )}
          </div>
          <Tabs
            value={metric}
            onValueChange={(v) => setMetric(v as Metric)}
          >
            <TabsList>
              <TabsTrigger value="hours">Hours</TabsTrigger>
              <TabsTrigger value="cost">Dollars</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                angle={-20}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={formatY}
                width={55}
              />
              <Tooltip
                cursor={{ fill: "rgba(36, 83, 46, 0.06)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      <div className="font-semibold">{d.label}</div>
                      <div className="text-muted-foreground">
                        {d.hours.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{" "}
                        hrs · {formatCurrency(d.cost)}
                      </div>
                      <div className="text-muted-foreground">
                        {d.task_count} task{d.task_count === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                }}
              />
              {stackSegments ? (
                stackSegments.keys.map((s) => (
                  <Bar
                    key={s.value}
                    dataKey={(row) =>
                      stackSegments.valueByKey(
                        row as CostAggregation,
                        s.value,
                        metric,
                      )
                    }
                    name={s.label}
                    stackId="a"
                    fill={s.color}
                    onClick={(datum) => {
                      const key =
                        (datum as { payload?: { key?: string } }).payload?.key;
                      if (typeof key === "string") onBarClick(key);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                ))
              ) : (
                <Bar
                  dataKey={metric}
                  onClick={(datum) => {
                    const key =
                      (datum as { payload?: { key?: string } }).payload?.key;
                    if (typeof key === "string") onBarClick(key);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.key}
                      fill={
                        selectedKeys.includes(d.key)
                          ? "#25532E"
                          : "#3C9D48"
                      }
                    />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
