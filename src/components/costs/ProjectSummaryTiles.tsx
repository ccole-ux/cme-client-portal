import { InfoIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CostSummary } from "@/lib/costs/summary";
import { formatCurrency } from "@/lib/status";
import { cn } from "@/lib/utils";

export function ProjectSummaryTiles({ summary }: { summary: CostSummary }) {
  const deltaSign = summary.escalation_delta >= 0 ? "+" : "−";
  const deltaAbs = Math.abs(summary.escalation_delta);
  const pctAbs = Math.abs(summary.escalation_delta_pct * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display tracking-wide text-sm">
          PROJECT SUMMARY
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile
          label="Contract Baseline"
          value={formatCurrency(summary.contract_baseline)}
          subtitle="flat 2026 rates (contract signing basis)"
          infoTooltip="R26-003 signed contract figure at 2026 rates. Hard-coded reference — does not recompute as rates escalate."
        />
        <Tile
          label="Forecast with Escalation"
          value={formatCurrency(summary.forecast_escalated)}
          subtitle="includes 3% Jan 1 2027 escalation on 2027 work"
        />
        <Tile
          label="Escalation Impact"
          value={`${deltaSign}${formatCurrency(deltaAbs)} (${deltaSign}${pctAbs.toFixed(2)}%)`}
          subtitle="increase from 2027 escalated rates"
          emphasize={summary.escalation_delta !== 0}
        />
        <Tile
          label="Total Hours"
          value={summary.total_hours.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}
          subtitle="baseline"
        />
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  subtitle,
  infoTooltip,
  emphasize,
}: {
  label: string;
  value: string;
  subtitle: string;
  infoTooltip?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted-foreground">
        <span>{label}</span>
        {infoTooltip && (
          <span
            className="inline-flex cursor-help text-muted-foreground/70 hover:text-muted-foreground"
            title={infoTooltip}
            aria-label={infoTooltip}
          >
            <InfoIcon className="h-3 w-3" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "font-display tracking-wide text-2xl mt-1 text-cme-dark-green tabular-nums",
          emphasize && "text-cme-dark-green",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1 leading-tight">
        {subtitle}
      </div>
    </div>
  );
}
