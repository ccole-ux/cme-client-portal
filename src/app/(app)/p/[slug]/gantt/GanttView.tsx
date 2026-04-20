"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import {
  GanttChart,
  type GanttImperativeHandle,
  type GanttTaskInput,
  type GanttViewMode,
  type UserMode,
} from "@/components/gantt/GanttChart";

export function GanttView({
  tasks,
  mode,
  slug,
  viewMode,
  projectStart,
  lockedKeys = [],
}: {
  tasks: GanttTaskInput[];
  mode: UserMode;
  slug: string;
  viewMode: GanttViewMode;
  projectStart: string;
  lockedKeys?: string[];
}) {
  const lockedSet = new Set(lockedKeys);
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const ganttRef = useRef<GanttImperativeHandle>(null);

  function jumpToStart() {
    ganttRef.current?.jumpTo(projectStart);
  }

  function handleClick(taskId: string) {
    const next = new URLSearchParams(search.toString());
    next.set("task", taskId);
    startTransition(() => {
      router.push(`/p/${slug}/gantt?${next.toString()}`);
    });
  }

  async function handleDrag(
    taskId: string,
    newStart: string,
    newFinish: string,
  ) {
    // Short-circuit if the dates on this task are already pending review.
    if (
      lockedSet.has(`${taskId}:start_date`) ||
      lockedSet.has(`${taskId}:finish_date`)
    ) {
      if (mode !== "cme_admin") {
        toast.error("These dates are pending review. Wait for CME Admin to review before editing.");
        return;
      }
      const ok = confirm(
        "A pending submission already modifies these dates. Your direct edit will override it. Continue?",
      );
      if (!ok) return;
    }
    if (mode === "cme_admin") {
      const res = await fetch(`/api/workplan-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: newStart,
          finish_date: newFinish,
        }),
      });
      if (res.ok) {
        toast.success("Task dates updated");
        startTransition(() => router.refresh());
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "update failed" }));
        toast.error(`Update failed: ${error ?? res.status}`);
      }
    } else {
      // Viewers + ACTC create a proposed_change draft. Task bar visual update
      // happens after the drawer opens (Session 6 adds Drafts tray).
      const old = tasks.find((t) => t.id === taskId);
      const res = await fetch(`/api/proposed-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "update",
          entity_type: "workplan_task",
          entity_id: taskId,
          change_data: {
            start_date: { old: old?.start, new: newStart },
            finish_date: { old: old?.end, new: newFinish },
          },
        }),
      });
      if (res.ok) {
        toast.success(
          "Draft created. Review from your Drafts tray (coming Session 6).",
        );
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "draft failed" }));
        toast.error(`Draft failed: ${error ?? res.status}`);
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={jumpToStart}
          className="rounded-md border px-2.5 py-1 hover:bg-muted"
        >
          Jump to project start
        </button>
        <span className="text-muted-foreground">
          Starts {projectStart}. Drag bars to reschedule; click for detail.
        </span>
      </div>
      <GanttChart
        tasks={tasks}
        mode={mode}
        onTaskClick={handleClick}
        onTaskDrag={handleDrag}
        viewMode={viewMode}
        projectStart={projectStart}
        imperativeRef={ganttRef}
      />
    </div>
  );
}
