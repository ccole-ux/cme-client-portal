"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon, XIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Change = {
  id: string;
  operation: string;
  entity_type: string;
  entity_id: string | null;
  change_data: Record<string, unknown>;
  label: { sub: string | null; primary: string };
  summary: { field: string; old: string; new: string }[];
};

type Decision = "accept" | "reject" | "skip";

export function ReviewSubmissionPanel({
  submissionId,
  slug,
  changes,
}: {
  submissionId: string;
  slug: string;
  changes: Change[];
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reviewNote, setReviewNote] = useState("");
  const [pending, startTransition] = useTransition();

  function setAll(d: Decision) {
    const next: Record<string, Decision> = {};
    for (const c of changes) next[c.id] = d;
    setDecisions(next);
  }

  async function submit() {
    const anyRejected = Object.values(decisions).some((d) => d === "reject");
    if (anyRejected && !reviewNote.trim()) {
      toast.error("Rejected changes require a review note.");
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions,
          reviewer_note: reviewNote.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Submission reviewed");
        router.push(`/p/${slug}/submissions`);
      } else {
        const { error } = await res
          .json()
          .catch(() => ({ error: "review failed" }));
        toast.error(`Review failed: ${error ?? res.status}`);
      }
    });
  }

  const decidedCount = Object.values(decisions).filter((d) => d !== "skip").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-cme-bright-green text-cme-bright-green hover:bg-cme-bright-green/10"
          onClick={() => setAll("accept")}
          disabled={pending}
        >
          Accept all
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-cme-red text-cme-red hover:bg-cme-red/10"
          onClick={() => setAll("reject")}
          disabled={pending}
        >
          Reject all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDecisions({})}
          disabled={pending}
        >
          Clear
        </Button>
      </div>

      <ul className="divide-y border rounded-md overflow-hidden">
        {changes.map((c) => {
          const d = decisions[c.id];
          return (
            <li
              key={c.id}
              className={cn(
                "p-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-3 items-start",
                d === "accept" && "bg-cme-bright-green/5",
                d === "reject" && "bg-cme-red/5",
              )}
            >
              <div className="min-w-0">
                {c.label.sub && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {c.label.sub}
                  </p>
                )}
                <p className="text-sm font-medium truncate">{c.label.primary}</p>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">
                  {c.operation}
                </p>
              </div>
              <div className="space-y-0.5 text-xs">
                {c.summary.map((s, i) => (
                  <div
                    key={`${c.id}-${s.field}-${i}`}
                    className="flex items-baseline gap-2"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-24 shrink-0">
                      {s.field}
                    </span>
                    <span className="text-muted-foreground line-through truncate">
                      {s.old}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-cme-dark-green truncate">{s.new}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <DecisionBtn
                  label="Accept"
                  icon={<CheckIcon className="h-3 w-3" />}
                  active={d === "accept"}
                  color="green"
                  onClick={() =>
                    setDecisions((prev) => ({ ...prev, [c.id]: "accept" }))
                  }
                />
                <DecisionBtn
                  label="Reject"
                  icon={<XIcon className="h-3 w-3" />}
                  active={d === "reject"}
                  color="red"
                  onClick={() =>
                    setDecisions((prev) => ({ ...prev, [c.id]: "reject" }))
                  }
                />
                <DecisionBtn
                  label="Skip"
                  icon={<MinusIcon className="h-3 w-3" />}
                  active={d === "skip" || !d}
                  color="muted"
                  onClick={() => {
                    const next = { ...decisions };
                    delete next[c.id];
                    setDecisions(next);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <label className="block text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
          Review note (required if rejecting)
        </label>
        <Textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value.slice(0, 500))}
          placeholder="Explain your decision — the submitter will see this."
          disabled={pending}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {decidedCount} of {changes.length} decided
        </p>
        <Button onClick={submit} disabled={pending || decidedCount === 0}>
          {pending ? "Submitting…" : "Finalize review"}
        </Button>
      </div>
    </div>
  );
}

function DecisionBtn({
  label,
  icon,
  active,
  color,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  color: "green" | "red" | "muted";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors",
        !active && "border-transparent text-muted-foreground hover:bg-muted",
        active && color === "green" && "bg-cme-bright-green text-white border-cme-bright-green",
        active && color === "red" && "bg-cme-red text-white border-cme-red",
        active && color === "muted" && "bg-muted text-muted-foreground border-muted",
      )}
      title={label}
    >
      {icon}
      {label}
    </button>
  );
}
