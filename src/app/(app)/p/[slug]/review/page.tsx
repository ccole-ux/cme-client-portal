import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProjectBySlugOrNotFound } from "@/lib/projects/queries";
import { getCurrentProfile } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/status";
import { summarizeChange } from "@/lib/drafts/queries";
import { ReviewSubmissionPanel } from "./ReviewSubmissionPanel";

export const metadata = { title: "Review Queue — CME Client Portal" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getCurrentProfile();
  if (profile?.role !== "cme_admin" && profile?.role !== "cme_reviewer") {
    redirect(`/p/${slug}`);
  }

  const project = await getProjectBySlugOrNotFound(slug);
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from("change_submissions")
    .select(
      "id, submitter_id, submitted_at, submitter_note, status, reviewer_id, reviewed_at, reviewer_note, users:users!change_submissions_submitter_id_fkey(full_name, email)",
    )
    .eq("project_id", project.id)
    .eq("status", "pending_review")
    .order("submitted_at", { ascending: false });

  const rows = (submissions ?? []) as unknown as Array<{
    id: string;
    submitter_id: string;
    submitted_at: string;
    submitter_note: string | null;
    status: string;
    reviewer_id: string | null;
    reviewed_at: string | null;
    reviewer_note: string | null;
    users: { full_name: string | null; email: string } | null;
  }>;

  const ids = rows.map((r) => r.id);
  const changes = ids.length
    ? (
        await supabase
          .from("proposed_changes")
          .select(
            "id, submission_id, operation, entity_type, entity_id, change_data, status",
          )
          .in("submission_id", ids)
      ).data ?? []
    : [];

  const referencedTaskIds = new Set<string>();
  for (const c of changes) {
    if (c.entity_type === "workplan_task" && c.entity_id) {
      referencedTaskIds.add(c.entity_id);
    }
    const cd = c.change_data as Record<string, unknown>;
    if (typeof cd?.predecessor_task_id === "string") {
      referencedTaskIds.add(cd.predecessor_task_id);
    }
    if (typeof cd?.successor_task_id === "string") {
      referencedTaskIds.add(cd.successor_task_id);
    }
  }

  const taskLabels = new Map<string, { wbs: string; task_name: string }>();
  if (referencedTaskIds.size > 0) {
    const { data: tasks } = await supabase
      .from("workplan_tasks")
      .select("id, wbs, task_name")
      .in("id", Array.from(referencedTaskIds));
    for (const t of tasks ?? []) {
      taskLabels.set(t.id, { wbs: t.wbs, task_name: t.task_name });
    }
  }

  const changesBySubmission = new Map<string, typeof changes>();
  for (const c of changes) {
    const list = changesBySubmission.get(c.submission_id ?? "") ?? [];
    list.push(c);
    changesBySubmission.set(c.submission_id ?? "", list);
  }

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME ADMIN
        </p>
        <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
          REVIEW QUEUE ({rows.length})
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Accept, reject, or review individual changes per submission.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No submissions currently pending review.
          </CardContent>
        </Card>
      ) : (
        rows.map((r) => {
          const submissionChanges = changesBySubmission.get(r.id) ?? [];
          return (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-display tracking-wide text-base">
                    Submission by {r.users?.full_name ?? r.users?.email ?? "(unknown)"}
                  </CardTitle>
                  <CardDescription>
                    Submitted {formatDate(r.submitted_at)} · {submissionChanges.length} change{submissionChanges.length === 1 ? "" : "s"}
                  </CardDescription>
                  {r.submitter_note && (
                    <blockquote className="mt-3 text-xs italic text-muted-foreground border-l-2 border-cme-bright-green/60 pl-3 max-w-2xl">
                      {r.submitter_note}
                    </blockquote>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ReviewSubmissionPanel
                  submissionId={r.id}
                  slug={slug}
                  changes={submissionChanges.map((c) => ({
                    id: c.id,
                    operation: c.operation,
                    entity_type: c.entity_type,
                    entity_id: c.entity_id,
                    change_data: c.change_data as Record<string, unknown>,
                    label: labelFor(c, taskLabels),
                    summary: summarizeChange(c.operation, c.change_data as Record<string, unknown>),
                  }))}
                />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function labelFor(
  c: {
    entity_type: string;
    entity_id: string | null;
    change_data: unknown;
  },
  tasks: Map<string, { wbs: string; task_name: string }>,
): { sub: string | null; primary: string } {
  if (c.entity_type === "workplan_task") {
    const t = c.entity_id ? tasks.get(c.entity_id) : null;
    if (t) return { sub: t.wbs, primary: t.task_name };
    return { sub: null, primary: "New task" };
  }
  if (c.entity_type === "task_dependency") {
    const cd = c.change_data as Record<string, unknown>;
    const pred = typeof cd.predecessor_task_id === "string"
      ? tasks.get(cd.predecessor_task_id)
      : null;
    const succ = typeof cd.successor_task_id === "string"
      ? tasks.get(cd.successor_task_id)
      : null;
    return {
      sub: "Dependency",
      primary: `${pred ? `${pred.wbs} ${pred.task_name}` : "?"} → ${succ ? `${succ.wbs} ${succ.task_name}` : "?"}`,
    };
  }
  return { sub: null, primary: c.entity_type };
}
