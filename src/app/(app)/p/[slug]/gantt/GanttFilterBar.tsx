"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const PHASES = ["1", "1.5", "2", "3", "PM"];
const VIEW_MODES: { value: "Week" | "Month" | "Quarter"; label: string }[] = [
  { value: "Week", label: "Week" },
  { value: "Month", label: "Month" },
  { value: "Quarter", label: "Quarter" },
];

export function GanttFilterBar({
  slug,
  initial,
}: {
  slug: string;
  initial: {
    phase: string;
    milestones: boolean;
    critical: boolean;
    view: "Week" | "Month" | "Quarter";
  };
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "all" || v === "" || v === "0") next.delete(k);
      else next.set(k, v);
    }
    next.delete("task"); // close drawer on filter change
    startTransition(() => {
      router.push(`/p/${slug}/gantt${next.size ? `?${next}` : ""}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-4 items-center text-sm">
      <label className="flex items-center gap-2">
        <span className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Phase
        </span>
        <select
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          value={initial.phase}
          onChange={(e) => update({ phase: e.target.value })}
        >
          <option value="all">All phases</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              Phase {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={initial.milestones}
          onChange={(e) =>
            update({ milestones: e.target.checked ? "1" : null })
          }
        />
        Milestones only
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={initial.critical}
          onChange={(e) =>
            update({ critical: e.target.checked ? "1" : null })
          }
        />
        Critical path only
      </label>
      <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
        <span className="px-2 text-[11px] tracking-widest uppercase text-muted-foreground">
          Zoom
        </span>
        {VIEW_MODES.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() =>
              update({ view: v.value === "Month" ? null : v.value })
            }
            className={cn(
              "px-2 py-1 text-xs rounded-sm",
              initial.view === v.value
                ? "bg-cme-dark-green text-white"
                : "hover:bg-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
