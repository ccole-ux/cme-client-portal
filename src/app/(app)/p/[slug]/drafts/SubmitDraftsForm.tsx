"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

const MAX = 500;

export function SubmitDraftsForm({
  projectId,
  slug,
  count,
}: {
  projectId: string;
  slug: string;
  count: number;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          submitter_note: note.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success(
          `Submitted ${count} change${count === 1 ? "" : "s"} for review`,
        );
        router.push(`/p/${slug}/submissions`);
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "submit failed" }));
        toast.error(`Submit failed: ${error ?? res.status}`);
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <label
            htmlFor="submission-note"
            className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1"
          >
            Submission note (optional, max {MAX})
          </label>
          <Textarea
            id="submission-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX))}
            placeholder="Summarize what changed and why. CME will see this on review."
            className="min-h-[96px]"
            disabled={pending}
          />
          <p className="text-[11px] text-right text-muted-foreground mt-1">
            {note.length} / {MAX}
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || count === 0}>
            {pending ? "Submitting…" : `Submit ${count} for review`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
