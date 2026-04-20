import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status/StatusBadge";
import { formatCurrency, formatCurrencyCents, formatDate } from "@/lib/status";
import type { Database } from "@/lib/supabase/types";
import type { ScheduleAnalysis } from "@/lib/schedule/critical-path";
import { getTaskAssignmentDetail } from "@/lib/projects/task-detail";
import { TaskDrawerShell } from "./TaskDrawerShell";
import { TaskDatesEditor } from "./TaskDatesEditor";
import { AddPredecessorButton } from "./AddPredecessorButton";

type TaskRow = Database["public"]["Tables"]["workplan_tasks"]["Row"];

export type DrawerRefTask = { id: string; wbs: string; name: string };

type AssignmentSummary = {
  resource_name: string;
  firm: string;
  hours: number;
};

export async function TaskDetailDrawer({
  slug,
  task,
  assignments,
  totalHours,
  totalCost,
  analysis,
  predecessors,
  successors,
  availableTasks,
  mode,
  closeHref,
}: {
  slug: string;
  task: TaskRow;
  assignments: AssignmentSummary[];
  totalHours: number;
  totalCost: number;
  analysis: ScheduleAnalysis | undefined;
  predecessors: DrawerRefTask[];
  successors: DrawerRefTask[];
  availableTasks: DrawerRefTask[];
  mode: "cme_admin" | "read_only";
  closeHref: string;
}) {
  const breakdown = await getTaskAssignmentDetail(task.id);
  const duration =
    task.start_date && task.finish_date
      ? daysInclusive(task.start_date, task.finish_date)
      : 0;

  return (
    <TaskDrawerShell closeHref={closeHref}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {task.wbs}
            {task.phase ? ` · Phase ${task.phase}` : ""}
            {task.is_milestone ? " · Milestone" : ""}
          </p>
          <h2 className="font-display tracking-wide text-cme-dark-green text-lg mt-1">
            {task.task_name}
          </h2>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <Section title="Dates">
        <TaskDatesEditor
          taskId={task.id}
          startDate={task.start_date}
          finishDate={task.finish_date}
          mode={mode}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-3">
          <dt className="text-muted-foreground">Duration</dt>
          <dd>{duration} days</dd>
          <dt className="text-muted-foreground">Total float</dt>
          <dd>
            {analysis ? `${analysis.total_float_days} days` : "—"}
          </dd>
          <dt className="text-muted-foreground">Critical path</dt>
          <dd>
            {analysis?.is_on_critical_path ? (
              <span className="text-cme-red font-semibold">Yes</span>
            ) : (
              "No"
            )}
          </dd>
          {analysis && (
            <>
              <dt className="text-muted-foreground">Early start</dt>
              <dd>{formatDate(analysis.early_start.toISOString())}</dd>
              <dt className="text-muted-foreground">Late finish</dt>
              <dd>{formatDate(analysis.late_finish.toISOString())}</dd>
            </>
          )}
        </dl>
      </Section>

      {!task.is_milestone && assignments.length > 0 && (
        <Section title="Resources">
          <ul className="space-y-1 text-sm">
            {assignments.map((a) => (
              <li
                key={`${a.resource_name}-${a.hours}`}
                className="flex justify-between"
              >
                <span>
                  {a.resource_name}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {a.firm}
                  </span>
                </span>
                <span className="tabular-nums">{a.hours} hrs</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t flex justify-between text-sm font-medium">
            <span>Total</span>
            <span className="tabular-nums">
              {totalHours} hrs · {formatCurrency(totalCost)}
            </span>
          </div>
        </Section>
      )}

      {!task.is_milestone && breakdown.length > 0 && (
        <Section title="Cost breakdown by rate period">
          <div className="space-y-3">
            {breakdown.map((b) => (
              <div key={b.resource_id} className="text-xs">
                <div className="font-medium text-sm mb-1">
                  {b.resource_name}
                </div>
                <div className="text-muted-foreground">
                  {b.breakdown.map((p, i) => (
                    <span key={`${p.year}-${p.period_start}`}>
                      {i > 0 && " · "}
                      {p.year}:{" "}
                      {p.period_hours.toFixed(1)} hrs ×{" "}
                      {formatCurrencyCents(p.rate)} ={" "}
                      {formatCurrencyCents(p.period_cost)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Dependencies"
        action={
          <AddPredecessorButton
            taskId={task.id}
            projectId={task.project_id}
            availableTasks={availableTasks}
            mode={mode}
          />
        }
      >
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              Predecessors
            </p>
            {predecessors.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No predecessors — this task can start independently.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {predecessors.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/p/${slug}/gantt?task=${p.id}`}
                      className="hover:text-cme-bright-green"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {p.wbs}
                      </span>
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              Successors
            </p>
            {successors.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No successors — nothing downstream depends on this.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {successors.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/p/${slug}/gantt?task=${s.id}`}
                      className="hover:text-cme-bright-green"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {s.wbs}
                      </span>
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section title="Comments">
        <Card className="border-dashed">
          <CardContent className="p-4 text-xs text-muted-foreground">
            Threaded comments wire up in Session 6.
          </CardContent>
        </Card>
      </Section>
    </TaskDrawerShell>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display tracking-wider text-[11px] uppercase text-cme-dark-green">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function daysInclusive(startISO: string, finishISO: string): number {
  const ms =
    new Date(finishISO).getTime() - new Date(startISO).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
