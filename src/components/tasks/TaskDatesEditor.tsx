"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lock = {
  field: string;
  submittedByName: string | null;
  submittedByEmail: string | null;
  submittedAt: string;
};

export function TaskDatesEditor({
  taskId,
  startDate,
  finishDate,
  mode,
  startLock,
  finishLock,
}: {
  taskId: string;
  startDate: string | null;
  finishDate: string | null;
  mode: "cme_admin" | "read_only";
  startLock?: Lock | null;
  finishLock?: Lock | null;
}) {
  const router = useRouter();
  const [start, setStart] = useState(startDate ?? "");
  const [finish, setFinish] = useState(finishDate ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = start !== (startDate ?? "") || finish !== (finishDate ?? "");

  const anyLock = startLock || finishLock;

  async function save(asDraft: boolean) {
    if (!dirty) return;
    if (anyLock && mode !== "cme_admin") {
      toast.error(
        "These dates are currently pending review. Wait for CME Admin to accept or reject before editing.",
      );
      return;
    }
    if (anyLock && mode === "cme_admin") {
      const ok = confirm(
        `A pending submission by ${(anyLock.submittedByName ?? anyLock.submittedByEmail) ?? "another user"} already modifies these dates. Override?`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      if (asDraft) {
        const res = await fetch("/api/proposed-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "update",
            entity_type: "workplan_task",
            entity_id: taskId,
            change_data: {
              start_date: { old: startDate, new: start },
              finish_date: { old: finishDate, new: finish },
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
      } else {
        const res = await fetch(`/api/workplan-tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: start,
            finish_date: finish,
          }),
        });
        if (res.ok) {
          toast.success("Dates updated");
          router.refresh();
        } else {
          const { error } = await res
            .json()
            .catch(() => ({ error: "update failed" }));
          toast.error(`Update failed: ${error ?? res.status}`);
        }
      }
    });
  }

  const lockedForViewer = anyLock && mode !== "cme_admin";

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
          Start
          {startLock && (
            <LockIcon
              className="h-3 w-3 text-cme-yellow"
              aria-label="Pending review"
            />
          )}
        </span>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          disabled={pending || Boolean(lockedForViewer)}
          className="font-mono"
        />
      </label>
      <label className="block">
        <span className="flex items-center gap-1 text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
          Finish
          {finishLock && (
            <LockIcon
              className="h-3 w-3 text-cme-yellow"
              aria-label="Pending review"
            />
          )}
        </span>
        <Input
          type="date"
          value={finish}
          onChange={(e) => setFinish(e.target.value)}
          disabled={pending || Boolean(lockedForViewer)}
          className="font-mono"
        />
      </label>
      {dirty && (
        <div className="col-span-2 flex gap-2 justify-end pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStart(startDate ?? "");
              setFinish(finishDate ?? "");
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => save(mode !== "cme_admin")}
            disabled={pending}
          >
            {pending
              ? "Saving…"
              : mode === "cme_admin"
                ? "Save"
                : "Propose draft"}
          </Button>
        </div>
      )}
    </div>
  );
}
