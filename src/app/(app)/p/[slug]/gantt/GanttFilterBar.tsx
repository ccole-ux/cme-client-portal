"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const PHASES = ["1", "1.5", "2", "3", "PM"];

export function GanttFilterBar({
  slug,
  initial,
}: {
  slug: string;
  initial: { phase: string; milestones: boolean; critical: boolean };
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
    // Drop `task` from the URL on filter change so the drawer closes
    next.delete("task");
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
    </div>
  );
}
