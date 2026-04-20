"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GanttTaskInput } from "@/components/gantt/GanttChart";

const PHASE_ORDER = ["1", "1.5", "2", "3", "PM"];

export function MobileTaskList({
  tasks,
  slug,
}: {
  tasks: GanttTaskInput[];
  slug: string;
}) {
  const byPhase = new Map<string, GanttTaskInput[]>();
  for (const t of tasks) {
    const key = t.phase ?? "PM";
    const list = byPhase.get(key) ?? [];
    list.push(t);
    byPhase.set(key, list);
  }

  const orderedKeys = [
    ...PHASE_ORDER.filter((p) => byPhase.has(p)),
    ...[...byPhase.keys()].filter((k) => !PHASE_ORDER.includes(k)),
  ];

  return (
    <div className="divide-y">
      {orderedKeys.map((phaseKey) => {
        const phaseTasks = byPhase.get(phaseKey) ?? [];
        return (
          <section key={phaseKey} className="p-4">
            <h3 className="font-display tracking-wider text-xs text-cme-dark-green uppercase mb-2">
              Phase {phaseKey}
            </h3>
            <div className="space-y-2">
              {phaseTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/p/${slug}/gantt?task=${t.id}`}
                  className={cn(
                    "block rounded-lg border px-3 py-2 text-sm hover:border-cme-bright-green",
                    t.is_critical && "border-cme-red bg-cme-red/5",
                    t.is_milestone && "bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t.wbs}
                    </span>
                    {t.is_milestone && <span className="text-xs">◆</span>}
                    {t.is_critical && (
                      <span className="text-[10px] uppercase tracking-wider text-cme-red">
                        Critical
                      </span>
                    )}
                  </div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.start} → {t.end}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
