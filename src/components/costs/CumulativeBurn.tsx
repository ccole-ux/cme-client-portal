"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BurnPoint } from "@/lib/costs/aggregate";
import { formatCurrency } from "@/lib/status";

type Metric = "hours" | "cost";

export type MilestoneMarker = {
  wbs: string;
  label: string;
  date: string; // YYYY-MM-DD
  cumulative_cost: number;
  cumulative_hours: number;
};

export function CumulativeBurn({
  points,
  milestones,
  todayISO,
}: {
  points: BurnPoint[];
  milestones: MilestoneMarker[];
  todayISO: string;
}) {
  const [metric, setMetric] = useState<Metric>("cost");

  const data = points.map((p) => ({
    date: p.date,
    cost: p.planned_cumulative_cost,
    hours: p.planned_cumulative_hours,
    t: new Date(p.date).getTime(),
  }));

  const milestoneData = milestones.map((m) => ({
    date: m.date,
    cost: m.cumulative_cost,
    hours: m.cumulative_hours,
    label: `${m.wbs} ${m.label}`,
    t: new Date(m.date).getTime(),
  }));

  function formatY(v: number) {
    if (metric === "cost") {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1000) return `$${Math.round(v / 1000)}k`;
      return `$${Math.round(v)}`;
    }
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  }

  function formatX(t: number) {
    const d = new Date(t);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display tracking-wide text-sm">
              CUMULATIVE BURN
            </CardTitle>
            <CardDescription className="text-xs">
              Baseline planned spend. Forecast overlay added when drafts are
              submitted (Session 6).
            </CardDescription>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              <TabsTrigger value="hours">Hours</TabsTrigger>
              <TabsTrigger value="cost">Dollars</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 18, left: 0, bottom: 24 }}
            >
              <defs>
                <linearGradient id="burnArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3C9D48" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3C9D48" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tick={{ fontSize: 11 }}
                tickFormatter={formatX}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={formatY}
                width={55}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const ms =
                    milestoneData.find((m) => m.date === d.date) ?? null;
                  return (
                    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      <div className="font-semibold">
                        {new Date(d.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-muted-foreground">
                        {d.hours.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{" "}
                        hrs · {formatCurrency(d.cost)}
                      </div>
                      {ms && (
                        <div className="mt-1 pt-1 border-t text-cme-dark-green">
                          ◆ {ms.label}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke="#3C9D48"
                strokeWidth={2}
                fill="url(#burnArea)"
                isAnimationActive={false}
              />
              <Scatter
                data={milestoneData}
                dataKey={metric}
                fill="#25532E"
                shape="diamond"
                isAnimationActive={false}
              />
              <ReferenceLine
                x={new Date(todayISO).getTime()}
                stroke="#FFCB0E"
                strokeDasharray="4 4"
                strokeWidth={2}
                ifOverflow="extendDomain"
                label={{
                  value: "Today",
                  fill: "#25532E",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
