import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getProjectBySlugOrNotFound,
  getTasksWithCosts,
} from "@/lib/projects/queries";
import { loadGanttData } from "@/lib/projects/gantt";
import { getCurrentProfile } from "@/lib/supabase/dal";
import { formatDate } from "@/lib/status";
import {
  loadPendingLocksForProject,
  lockedFieldKeySet,
} from "@/lib/drafts/field-state";
import { createClient } from "@/lib/supabase/server";
import { GanttView } from "./GanttView";
import { GanttFilterBar } from "./GanttFilterBar";
import { MobileTaskList } from "./MobileTaskList";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { DownloadMenu } from "@/components/export/DownloadMenu";
import type {
  GanttTaskInput,
  GanttViewMode,
} from "@/components/gantt/GanttChart";

export const metadata = { title: "Gantt — CME Client Portal" };

export default async function GanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    task?: string;
    phase?: string;
    milestones?: string;
    critical?: string;
    view?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const [gantt, tasksWithCosts, taskLocks] = await Promise.all([
    loadGanttData(project.id),
    getTasksWithCosts(project.id),
    loadPendingLocksForProject(supabase, project.id, "workplan_task"),
  ]);
  const lockedKeys = lockedFieldKeySet(taskLocks);

  const depsBySuccessor = new Map<string, string[]>();
  const depsByPredecessor = new Map<string, string[]>();
  for (const d of gantt.dependencies) {
    const succList = depsBySuccessor.get(d.successor_task_id) ?? [];
    succList.push(d.predecessor_task_id);
    depsBySuccessor.set(d.successor_task_id, succList);

    const predList = depsByPredecessor.get(d.predecessor_task_id) ?? [];
    predList.push(d.successor_task_id);
    depsByPredecessor.set(d.predecessor_task_id, predList);
  }

  // Apply filters from searchParams
  const selectedPhase = sp.phase ?? "all";
  const milestonesOnly = sp.milestones === "1";
  const criticalOnly = sp.critical === "1";
  const viewMode: GanttViewMode =
    sp.view === "Week" || sp.view === "Quarter" ? sp.view : "Month";

  // Index resources + hours per task from the tasksWithCosts helper.
  const resourcesByTask = new Map<
    string,
    { name: string; firm: string }[]
  >();
  for (const tc of tasksWithCosts) {
    resourcesByTask.set(
      tc.task.id,
      tc.assignments
        .map((a) => ({
          name: a.resource?.full_name ?? "Unknown",
          firm: a.resource?.firm ?? "",
        }))
        .filter((r) => r.name !== "Unknown"),
    );
  }

  const visible = gantt.tasks.filter((t) => {
    if (!t.start_date || !t.finish_date) return false;
    if (selectedPhase !== "all" && t.phase !== selectedPhase) return false;
    if (milestonesOnly && !t.is_milestone) return false;
    if (criticalOnly) {
      const a = gantt.analysis.get(t.id);
      if (!a?.is_on_critical_path) return false;
    }
    return true;
  });

  // Sort visible tasks by phase then start_date so swim-lane tints cluster.
  const phaseOrder: Record<string, number> = {
    "1": 1,
    "1.5": 2,
    "2": 3,
    "3": 4,
    PM: 5,
  };
  visible.sort((a, b) => {
    const pa = phaseOrder[a.phase ?? "PM"] ?? 99;
    const pb = phaseOrder[b.phase ?? "PM"] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.start_date ?? "").localeCompare(b.start_date ?? "");
  });

  const ganttInput: GanttTaskInput[] = visible.map((t) => {
    const start = t.start_date!;
    const finish = t.finish_date!;
    const duration = Math.max(
      1,
      Math.round(
        (new Date(finish).getTime() - new Date(start).getTime()) /
          86_400_000,
      ) + 1,
    );
    return {
      id: t.id,
      wbs: t.wbs,
      name: t.task_name,
      start,
      end: finish,
      progress: 0,
      phase: t.phase,
      is_milestone: t.is_milestone,
      is_critical: gantt.analysis.get(t.id)?.is_on_critical_path ?? false,
      status: t.status,
      dependencies: depsBySuccessor.get(t.id) ?? [],
      resources: resourcesByTask.get(t.id) ?? [],
      duration_days: t.is_milestone ? 0 : duration,
    };
  });

  const criticalCount = [...gantt.analysis.values()].filter(
    (a) => a.is_on_critical_path,
  ).length;

  // If ?task= is set, prepare drawer data.
  const selectedTaskId = sp.task;
  const selectedTask = selectedTaskId
    ? tasksWithCosts.find((tc) => tc.task.id === selectedTaskId)
    : null;
  const selectedAnalysis = selectedTaskId
    ? gantt.analysis.get(selectedTaskId)
    : undefined;
  const selectedPredecessors = selectedTaskId
    ? (depsBySuccessor.get(selectedTaskId) ?? []).map((pid) => ({
        id: pid,
        wbs: gantt.tasks.find((t) => t.id === pid)?.wbs ?? "?",
        name:
          gantt.tasks.find((t) => t.id === pid)?.task_name ?? "(unknown)",
      }))
    : [];
  const selectedSuccessors = selectedTaskId
    ? (depsByPredecessor.get(selectedTaskId) ?? []).map((sid) => ({
        id: sid,
        wbs: gantt.tasks.find((t) => t.id === sid)?.wbs ?? "?",
        name:
          gantt.tasks.find((t) => t.id === sid)?.task_name ?? "(unknown)",
      }))
    : [];

  const role = profile?.role ?? "actc_viewer";
  const mode: "cme_admin" | "read_only" =
    role === "cme_admin" ? "cme_admin" : "read_only";

  return (
    <div className="max-w-7xl px-8 py-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            WORKPLAN
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            GANTT
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {formatDate(gantt.projectStart.toISOString())} →{" "}
            {formatDate(gantt.projectEnd.toISOString())} ·{" "}
            {criticalCount} tasks on critical path
          </div>
          <DownloadMenu slug={slug} scope="canonical" />
        </div>
      </div>

      <GanttFilterBar
        slug={slug}
        initial={{
          phase: selectedPhase,
          milestones: milestonesOnly,
          critical: criticalOnly,
          view: viewMode,
        }}
      />

      <Legend />

      <div className="hidden md:block">
        <GanttView
          tasks={ganttInput}
          mode={mode}
          slug={slug}
          viewMode={viewMode}
          projectStart={gantt.projectStart
            .toISOString()
            .slice(0, 10)}
          lockedKeys={Array.from(lockedKeys)}
        />
      </div>
      <Card className="md:hidden">
        <div>
          <MobileTaskList tasks={ganttInput} slug={slug} />
        </div>
      </Card>

      {!selectedTask && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="font-display tracking-wide text-base">
              Click a task
            </CardTitle>
            <CardDescription>
              Detail drawer shows dates, cost breakdown, and dependencies.
              CME Admins can drag bars to reschedule; viewers&apos; drags
              become proposed drafts (Session 6 adds the Drafts tray).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {selectedTask && selectedTaskId && (
        <TaskDetailDrawer
          slug={slug}
          task={selectedTask.task}
          assignments={selectedTask.assignments.map((a) => ({
            resource_name: a.resource?.full_name ?? "Unknown",
            firm: a.resource?.firm ?? "",
            hours: Number(a.hours),
          }))}
          totalHours={selectedTask.total_hours}
          totalCost={selectedTask.total_cost}
          analysis={selectedAnalysis}
          predecessors={selectedPredecessors}
          successors={selectedSuccessors}
          availableTasks={gantt.tasks
            .filter((t) => t.id !== selectedTaskId)
            .map((t) => ({ id: t.id, wbs: t.wbs, name: t.task_name }))}
          mode={mode}
          closeHref={`/p/${slug}/gantt`}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <LegendDot color="#E85F46" label="Critical path" />
      <LegendDot color="#3C9D48" label="On schedule" />
      <LegendDot color="#25532E" label="Milestone" shape="diamond" />
      <LegendDot color="#FFCB0E" label="Today" shape="line" />
    </div>
  );
}

function LegendDot({
  color,
  label,
  shape = "bar",
}: {
  color: string;
  label: string;
  shape?: "bar" | "diamond" | "line";
}) {
  return (
    <span className="flex items-center gap-1.5">
      {shape === "bar" && (
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ backgroundColor: color }}
        />
      )}
      {shape === "diamond" && (
        <span
          className="inline-block h-3 w-3 rotate-45"
          style={{ backgroundColor: color }}
        />
      )}
      {shape === "line" && (
        <span
          className="inline-block h-3 w-0.5"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}
