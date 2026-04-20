"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddPredecessorButton({
  taskId,
  projectId,
  availableTasks,
  mode,
}: {
  taskId: string;
  projectId: string;
  availableTasks: { id: string; wbs: string; name: string }[];
  mode: "cme_admin" | "read_only";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = query
    ? availableTasks.filter((t) =>
        `${t.wbs} ${t.name}`.toLowerCase().includes(query.toLowerCase()),
      )
    : availableTasks.slice(0, 30);

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      if (mode === "cme_admin") {
        const res = await fetch("/api/task-dependencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            predecessor_task_id: selected,
            successor_task_id: taskId,
          }),
        });
        if (res.ok) {
          toast.success("Predecessor added");
          setOpen(false);
          setSelected(null);
          setQuery("");
          router.refresh();
        } else {
          const { error } = await res
            .json()
            .catch(() => ({ error: "failed" }));
          toast.error(`Failed: ${error ?? res.status}`);
        }
      } else {
        const res = await fetch("/api/proposed-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "create",
            entity_type: "task_dependency",
            entity_id: null,
            change_data: {
              project_id: projectId,
              predecessor_task_id: selected,
              successor_task_id: taskId,
              dependency_type: "finish_to_start",
              lag_days: 0,
            },
          }),
        });
        if (res.ok) {
          toast.success(
            "Dependency draft created. Review from Drafts tray (Session 6).",
          );
          setOpen(false);
          setSelected(null);
        } else {
          const { error } = await res
            .json()
            .catch(() => ({ error: "failed" }));
          toast.error(`Failed: ${error ?? res.status}`);
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Add predecessor
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add predecessor</DialogTitle>
          <DialogDescription>
            Pick a task that must finish before this one can start.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search WBS or task name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
          {filtered.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              No tasks match.
            </div>
          )}
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                selected === t.id ? "bg-cme-bright-green/10" : ""
              }`}
            >
              <span className="font-mono text-[11px] text-muted-foreground mr-2">
                {t.wbs}
              </span>
              {t.name}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || pending}>
            {pending
              ? "Saving…"
              : mode === "cme_admin"
                ? "Add"
                : "Propose draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
