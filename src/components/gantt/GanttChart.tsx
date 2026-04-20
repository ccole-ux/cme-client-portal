"use client";

/**
 * Gantt library evaluation — 2026-04-19.
 *
 * Chose `frappe-gantt@1.2.2` (MIT, ~30KB gz) after comparing against:
 * - `dhtmlx-gantt Standard` — RULED OUT. Standard build is GPL; permissive use
 *   requires a paid commercial license. Spec §4 requires permissive licensing.
 * - Custom React SVG — full control but ~400 LOC of drag/resize/arrow code in
 *   a single session. Higher implementation risk; no test coverage for drag.
 * - `frappe-gantt` — native drag-to-move AND drag-to-resize, finish-to-start
 *   dependency arrows built in, milestone rendering when start==end, today
 *   highlight via CSS variable, CSS hooks for per-task `custom_class` (used
 *   below for critical-path red + phase-tinted bars), MIT license.
 *
 * Layout wrap (Session 4 polish):
 * - Left pane: sticky 450px task table with WBS, name, phase, resource,
 *   duration. Own vertical scroll, synced with the Gantt via a single scroll
 *   handler so row N in the table aligns with bar N on the timeline.
 * - Right pane: frappe-gantt with horizontal scroll for the timeline, its
 *   internal scroll-container owning vertical scroll. CSS override on
 *   `.grid-header` drops the +10px padding so both panes' header heights
 *   (75px) + row heights (36px) match exactly.
 *
 * Trade-offs accepted:
 * - Library is vanilla JS; wrapped with useRef/useEffect.
 * - No TypeScript types shipped; narrow local type for the constructor.
 */

import { useEffect, useImperativeHandle, useRef } from "react";
import "./frappe-gantt.css";
import "./gantt.css";
import type { TaskStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export type GanttImperativeHandle = {
  jumpTo: (isoDate: string) => void;
  fitToRange: (startIso: string, endIso: string) => void;
};

export type GanttTaskInput = {
  id: string;
  wbs: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  progress: number; // 0–100
  phase: string | null;
  is_milestone: boolean;
  is_critical: boolean;
  status: TaskStatus;
  dependencies: string[]; // predecessor ids
  resources: { name: string; firm: string }[];
  duration_days: number;
};

type GanttInstance = {
  refresh?: (tasks: Record<string, unknown>[]) => void;
  gantt_start?: Date;
  config?: { column_width?: number };
  $container?: HTMLElement;
};

type GanttCtor = new (
  wrapper: HTMLElement,
  tasks: Record<string, unknown>[],
  options: Record<string, unknown>,
) => GanttInstance;

export type UserMode = "cme_admin" | "read_only";
export type GanttViewMode = "Week" | "Month" | "Quarter";

const HEADER_HEIGHT = 75; // matches grid-header CSS override in gantt.css
const ROW_HEIGHT = 36; // bar_height (24) + padding (12) — see frappe-gantt defaults

export function GanttChart({
  tasks,
  mode,
  onTaskClick,
  onTaskDrag,
  onTaskHoverEnter,
  onTaskHoverLeave,
  viewMode = "Month",
  projectStart,
  imperativeRef,
}: {
  tasks: GanttTaskInput[];
  mode: UserMode;
  onTaskClick: (taskId: string) => void;
  onTaskDrag?: (
    taskId: string,
    newStart: string,
    newFinish: string,
  ) => void;
  onTaskHoverEnter?: (taskId: string) => void;
  onTaskHoverLeave?: () => void;
  viewMode?: GanttViewMode;
  projectStart?: string; // YYYY-MM-DD
  imperativeRef?: React.Ref<GanttImperativeHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<GanttInstance | null>(null);
  const clickHandlerRef = useRef(onTaskClick);
  const dragHandlerRef = useRef(onTaskDrag);

  useEffect(() => {
    clickHandlerRef.current = onTaskClick;
    dragHandlerRef.current = onTaskDrag;
  });

  // Build the frappe-gantt chart
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const libTasks = tasks.map((t) => ({
      id: t.id,
      name: `${t.wbs} · ${t.name}`,
      start: t.start,
      end: t.end,
      progress: t.progress,
      dependencies: t.dependencies.join(","),
      custom_class: [
        phaseClass(t.phase),
        t.is_critical ? "is-critical" : "",
        t.is_milestone ? "is-milestone" : "",
      ]
        .filter(Boolean)
        .join(" "),
    }));

    (async () => {
      const mod = (await import("frappe-gantt")) as unknown as {
        default: GanttCtor;
      };
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = "";

      const Gantt = mod.default;
      const gantt = new Gantt(containerRef.current, libTasks, {
        view_mode: viewMode,
        readonly: mode !== "cme_admin",
        readonly_progress: true,
        container_height: "auto",
        bar_height: 24,
        padding: 12,
        // Without this, the library pads 30 units before earliest task (Nov
        // 2023 for Month view!), leaving the project area off-screen on load.
        infinite_padding: false,
        scroll_to: projectStart ?? "today",
        today_button: false,
        popup: ({
          task,
          set_title,
          set_details,
        }: {
          task: { name: string; start: Date; end: Date };
          set_title: (html: string) => void;
          set_details: (html: string) => void;
        }) => {
          set_title(task.name);
          set_details(
            `${formatDate(task.start)} → ${formatDate(task.end)}`,
          );
        },
        on_click: (task: { id: string }) => {
          clickHandlerRef.current(task.id);
        },
        on_date_change: (
          task: { id: string },
          start: Date,
          end: Date,
        ) => {
          const handler = dragHandlerRef.current;
          if (!handler) return;
          handler(task.id, isoDay(start), isoDay(end));
        },
      });
      ganttRef.current = gantt;

      // Force a non-smooth scroll so the project start is visible immediately
      // regardless of scroll_to's async smooth animation. Defer one frame to
      // let the library attach .gantt-container to the DOM.
      if (projectStart) {
        requestAnimationFrame(() => {
          scrollContainerToDate(gantt, projectStart);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasks, mode, viewMode, projectStart]);

  useImperativeHandle(
    imperativeRef,
    () => ({
      jumpTo: (isoDate: string) => {
        const g = ganttRef.current;
        if (g) scrollContainerToDate(g, isoDate);
      },
      fitToRange: () => {
        // Month view with ~365 day project shows ~12 months across the width,
        // which matches the sweet spot. Callers drive view_mode separately.
      },
    }),
    [],
  );

  // Sync vertical scroll between the left task table and the Gantt container
  useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightPaneRef.current?.querySelector<HTMLElement>(
      ".gantt-container",
    );
    if (!left || !right) return;

    let locked: "left" | "right" | null = null;
    const unlock = () => {
      locked = null;
    };

    const onLeft = () => {
      if (locked === "right") return;
      locked = "left";
      right.scrollTop = left.scrollTop;
      requestAnimationFrame(unlock);
    };
    const onRight = () => {
      if (locked === "left") return;
      locked = "right";
      left.scrollTop = right.scrollTop;
      requestAnimationFrame(unlock);
    };

    left.addEventListener("scroll", onLeft, { passive: true });
    right.addEventListener("scroll", onRight, { passive: true });
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
    // Re-run when tasks change — frappe-gantt rebuilds and the
    // .gantt-container element may be swapped under us.
  }, [tasks, viewMode]);

  return (
    <div className="cme-gantt-layout">
      <div
        className="cme-gantt-left"
        ref={leftScrollRef}
        style={{ width: 450 }}
      >
        <div
          className="cme-gantt-left-header"
          style={{ height: HEADER_HEIGHT }}
        >
          <div className="grid grid-cols-[1fr_auto] items-end h-full px-3 pb-2 border-b text-[11px] tracking-widest uppercase text-muted-foreground">
            <div>Task</div>
            <div className="text-right">Duration</div>
          </div>
        </div>
        <ul className="divide-y">
          {tasks.map((t) => (
            <li
              key={t.id}
              style={{ height: ROW_HEIGHT }}
              className={cn(
                "px-3 flex items-center text-xs",
                t.is_critical && "bg-cme-red/5",
                t.is_milestone && "bg-muted/40",
              )}
              onMouseEnter={() => onTaskHoverEnter?.(t.id)}
              onMouseLeave={() => onTaskHoverLeave?.()}
              title={`${t.wbs} · ${t.name}`}
            >
              <div className="flex-1 min-w-0 grid grid-cols-[48px_minmax(0,1fr)_auto] gap-2 items-center">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t.wbs}
                </span>
                <span className="truncate font-medium">
                  {t.is_milestone && (
                    <span className="mr-1 text-cme-dark-green">◆</span>
                  )}
                  {truncate(t.name, 50)}
                </span>
                <span className="flex items-center gap-1.5">
                  {t.phase && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      P{t.phase}
                    </span>
                  )}
                  <ResourceSummary resources={t.resources} />
                </span>
              </div>
              <div
                className={cn(
                  "tabular-nums text-right ml-2 text-[11px]",
                  t.is_critical && "text-cme-red font-semibold",
                )}
              >
                {t.is_milestone ? "—" : `${t.duration_days}d`}
              </div>
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="p-6 text-center text-xs text-muted-foreground">
              No tasks match the current filters.
            </li>
          )}
        </ul>
      </div>
      <div className="cme-gantt-right" ref={rightPaneRef}>
        <div ref={containerRef} className="cme-gantt" />
      </div>
    </div>
  );
}

function ResourceSummary({
  resources,
}: {
  resources: { name: string; firm: string }[];
}) {
  if (!resources || resources.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground italic">—</span>
    );
  }
  if (resources.length === 1) {
    const last = resources[0].name.split(/\s+/).slice(-1)[0];
    return <span className="text-[10px] text-muted-foreground">{last}</span>;
  }
  return (
    <span
      className="text-[10px] text-muted-foreground"
      title={resources.map((r) => r.name).join(", ")}
    >
      {resources.length} resources
    </span>
  );
}

function phaseClass(phase: string | null): string {
  if (!phase) return "";
  if (phase === "1.5") return "phase-1-5";
  if (phase === "PM") return "phase-pm";
  return `phase-${phase}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function scrollContainerToDate(gantt: GanttInstance, isoDate: string) {
  const container = gantt.$container;
  const start = gantt.gantt_start;
  const width = gantt.config?.column_width;
  if (!container || !start || !width) return;

  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);

  // For Month view frappe-gantt steps by month; for Week it steps by week.
  // Compute fractional months between gantt_start and target.
  const months =
    (target.getFullYear() - start.getFullYear()) * 12 +
    (target.getMonth() - start.getMonth()) +
    target.getDate() / 30;
  const scrollLeft = Math.max(0, months * width - width / 4);
  container.scrollLeft = scrollLeft;
}
