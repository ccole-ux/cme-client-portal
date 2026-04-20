import ReactMarkdown from "react-markdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getProjectBySlugOrNotFound,
  getTasksWithCosts,
} from "@/lib/projects/queries";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/status";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/status";

export const metadata = { title: "Overview — CME Client Portal" };

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const supabase = await createClient();
  const tasksWithCosts = await getTasksWithCosts(project.id);
  const { data: narrative } = await supabase
    .from("narrative_sections")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_published", true)
    .order("sort_order");

  // Status summary — count tasks and milestones separately for clarity.
  const statusCount: Partial<Record<TaskStatus, number>> = {};
  let taskTotal = 0;
  let milestoneTotal = 0;
  for (const t of tasksWithCosts) {
    statusCount[t.task.status] = (statusCount[t.task.status] ?? 0) + 1;
    if (t.task.is_milestone) milestoneTotal += 1;
    else taskTotal += 1;
  }
  const notStarted = statusCount["not_started"] ?? 0;
  const inDev = statusCount["in_development"] ?? 0;
  const accepted = statusCount["accepted"] ?? 0;
  const statusCountNum = Object.keys(statusCount).length;

  // Phase summary (exclude milestones from phase rollups to keep hours aligned)
  const phaseTotals = new Map<string, { hours: number; tasks: number }>();
  for (const t of tasksWithCosts) {
    if (t.task.is_milestone) continue;
    const phase = t.task.phase ?? "OTHER";
    const cur = phaseTotals.get(phase) ?? { hours: 0, tasks: 0 };
    cur.hours += t.total_hours;
    cur.tasks += 1;
    phaseTotals.set(phase, cur);
  }
  const phases = ["1", "1.5", "2", "3", "PM"].map((p) => ({
    phase: p,
    ...(phaseTotals.get(p) ?? { hours: 0, tasks: 0 }),
  }));

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            PROJECT OVERVIEW
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            STATUS NARRATIVE
          </h2>
        </div>
        <Button variant="outline" disabled title="Exports land in Session 6">
          Download…
        </Button>
      </div>

      {/* Project metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide">
            PROJECT DETAILS
          </CardTitle>
          <CardDescription>
            Contract kickoff {formatDate(project.kickoff_on)} · target complete{" "}
            {formatDate(project.target_complete_on)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Client" value={project.client_name} />
          <Stat label="Baseline year" value={String(project.baseline_year)} />
          <Stat
            label="Baseline hours"
            value={project.total_hours_baseline?.toLocaleString() ?? "—"}
          />
          <Stat
            label="Baseline cost"
            value={
              project.total_cost_baseline != null
                ? formatCurrency(project.total_cost_baseline)
                : "—"
            }
          />
        </CardContent>
      </Card>

      {/* Status summary */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide">
            STATUS SUMMARY
          </CardTitle>
          <CardDescription>
            {taskTotal} tasks + {milestoneTotal} milestones across{" "}
            {statusCountNum}{" "}
            {statusCountNum === 1 ? "status" : "statuses"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <Stat
            label={TASK_STATUS_LABEL["not_started"]}
            value={String(notStarted)}
          />
          <Stat
            label={TASK_STATUS_LABEL["in_development"]}
            value={String(inDev)}
          />
          <Stat
            label={TASK_STATUS_LABEL["accepted"]}
            value={String(accepted)}
          />
        </CardContent>
      </Card>

      {/* Phase summary */}
      <div className="grid md:grid-cols-5 gap-4">
        {phases.map((p) => (
          <Card key={p.phase}>
            <CardHeader className="pb-2">
              <CardDescription className="text-[11px] tracking-widest uppercase">
                Phase {p.phase}
              </CardDescription>
              <CardTitle className="font-display text-2xl tracking-wide">
                {p.hours.toLocaleString()} hrs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {p.tasks} tasks
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Narrative */}
      <section className="space-y-4">
        <h3 className="font-display tracking-wider text-cme-dark-green text-lg">
          STATUS NARRATIVE
        </h3>
        {(narrative ?? []).map((n) => (
          <Card key={n.id}>
            <CardHeader>
              <CardTitle className="font-display tracking-wide text-base">
                {n.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <ReactMarkdown>{n.body_markdown}</ReactMarkdown>
            </CardContent>
          </Card>
        ))}
        {(!narrative || narrative.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Narrative not yet seeded.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-widest uppercase text-muted-foreground">
        {label}
      </div>
      <div className="font-display tracking-wide text-lg">{value}</div>
    </div>
  );
}
