"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  slug: string;
  phases: string[];
  statuses: { value: string; label: string }[];
  initial: { phase: string; status: string; q: string };
};

export function TaskFilters({ slug, phases, statuses, initial }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyParam(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.push(`/p/${slug}/tasks${next.size ? `?${next}` : ""}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Search
        </label>
        <Input
          className="w-64"
          defaultValue={initial.q}
          placeholder="WBS or task name…"
          onChange={(e) => {
            const v = e.target.value;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => applyParam("q", v), 250);
          }}
        />
      </div>
      <div>
        <label className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Phase
        </label>
        <select
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          value={initial.phase}
          onChange={(e) => applyParam("phase", e.target.value)}
        >
          <option value="all">All phases</option>
          {phases.map((p) => (
            <option key={p} value={p}>
              Phase {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Status
        </label>
        <select
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          value={initial.status}
          onChange={(e) => applyParam("status", e.target.value)}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
