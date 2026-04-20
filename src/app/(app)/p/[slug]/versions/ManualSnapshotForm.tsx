"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function ManualSnapshotForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function capture() {
    if (!label.trim()) {
      toast.error("Enter a label first");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          label: label.trim(),
        }),
      });
      if (res.ok) {
        setLabel("");
        toast.success("Snapshot captured");
        router.refresh();
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "failed" }));
        toast.error(`Snapshot failed: ${error ?? res.status}`);
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="snapshot-label"
            className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1"
          >
            Capture manual snapshot
          </label>
          <Input
            id="snapshot-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. "Baseline for ACTC December review"'
            disabled={pending}
          />
        </div>
        <Button onClick={capture} disabled={pending}>
          {pending ? "Capturing…" : "Capture"}
        </Button>
      </CardContent>
    </Card>
  );
}
