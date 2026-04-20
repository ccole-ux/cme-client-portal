import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getProjectBySlugOrNotFound,
} from "@/lib/projects/queries";
import { loadCostData } from "@/lib/projects/costs";
import { CrossFilterBars } from "@/components/costs/CrossFilterBars";
import { MonthlyBreakdownTable } from "@/components/costs/MonthlyBreakdownTable";
import { CumulativeBurn } from "@/components/costs/CumulativeBurn";
import { ActiveFilterPills } from "@/components/costs/ActiveFilterPills";
import { ProjectSummaryTiles } from "@/components/costs/ProjectSummaryTiles";
import { DownloadMenu } from "@/components/export/DownloadMenu";

export const metadata = { title: "Costs — CME Client Portal" };

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function CostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    firm?: string | string[];
    resource?: string | string[];
    phase?: string | string[];
    month?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getProjectBySlugOrNotFound(slug);

  const filters = {
    firms: toArray(sp.firm),
    resource_ids: toArray(sp.resource),
    phases: toArray(sp.phase),
    year_months: toArray(sp.month),
  };

  const projectStart = project.kickoff_on ?? "2026-05-01";
  const projectEnd = project.target_complete_on ?? "2027-04-30";

  const cost = await loadCostData(
    project.id,
    projectStart,
    projectEnd,
    filters,
  );

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-7xl px-8 py-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            FINANCIALS
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            COSTS
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Planned spend across A26-0057. Click any bar, table cell, or
            resource to filter.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-muted-foreground">
            {cost.filteredRows.length} task-resource rows in view
          </div>
          <DownloadMenu slug={slug} scope="canonical" />
        </div>
      </div>

      <ProjectSummaryTiles summary={cost.summary} />

      <ActiveFilterPills resourceNameById={cost.resourceNameById} />

      <CrossFilterBars
        byFirm={cost.byFirm}
        byResource={cost.byResource}
        byPhase={cost.byPhase}
        byMonth={cost.byMonth}
        monthByPhase={cost.monthByPhase}
      />

      <MonthlyBreakdownTable
        breakdown={cost.breakdown}
        firmOrder={cost.firmOrder}
        resourceOrder={cost.resourceOrder}
      />

      <CumulativeBurn
        points={cost.burn}
        milestones={cost.milestones}
        todayISO={todayISO}
        forecastMax={{
          hours: cost.summary.total_hours,
          cost: cost.summary.forecast_escalated,
        }}
      />

      {cost.filteredRows.length === 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="font-display tracking-wide text-base">
              No data matches the current filters
            </CardTitle>
            <CardDescription>
              Click a bar, chip, or <em>Clear all</em> to reset.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  );
}
