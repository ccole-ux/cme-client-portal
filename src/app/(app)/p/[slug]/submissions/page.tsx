import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProjectBySlugOrNotFound } from "@/lib/projects/queries";
import { getCurrentProfile, getSessionUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DownloadMenu } from "@/components/export/DownloadMenu";

export const metadata = { title: "Submissions — CME Client Portal" };

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const user = await getSessionUser();
  if (!user || !profile) return null;

  const supabase = await createClient();
  const isCmeStaff = profile.role === "cme_admin" || profile.role === "cme_viewer";

  let query = supabase
    .from("change_submissions")
    .select(
      "id, submitter_id, submitted_at, submitter_note, status, reviewer_id, reviewed_at, reviewer_note, users:users!change_submissions_submitter_id_fkey(full_name, email)",
    )
    .eq("project_id", project.id)
    .order("submitted_at", { ascending: false });

  // ACTC users only see their own; CME staff sees all. RLS enforces this too
  // but we short-circuit here so the UI stays consistent.
  if (!isCmeStaff) {
    query = query.eq("submitter_id", user.id);
  }
  const { data: submissions } = await query;

  const ids = (submissions ?? []).map((s) => s.id);
  const changeCountById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: counts } = await supabase
      .from("proposed_changes")
      .select("submission_id")
      .in("submission_id", ids);
    for (const c of counts ?? []) {
      const key = c.submission_id;
      if (!key) continue;
      changeCountById.set(key, (changeCountById.get(key) ?? 0) + 1);
    }
  }

  const rows = (submissions ?? []) as unknown as Array<{
    id: string;
    submitted_at: string;
    submitter_note: string | null;
    status: "pending_review" | "accepted" | "rejected" | "mixed" | "withdrawn";
    reviewer_id: string | null;
    reviewed_at: string | null;
    reviewer_note: string | null;
    users: { full_name: string | null; email: string } | null;
  }>;

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            CHANGE HISTORY
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            SUBMISSIONS ({rows.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isCmeStaff
              ? "Every submission across all users."
              : "Your submissions on this project."}
          </p>
        </div>
        <DownloadMenu slug={slug} scope="canonical" />
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No submissions yet on this project.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display tracking-wide text-sm">
              ALL SUBMISSIONS
            </CardTitle>
            <CardDescription className="text-xs">
              Click a row to download the frozen snapshot as PDF / Excel / CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-3 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,3fr)_auto_auto] gap-4 items-center"
                >
                  <div>
                    <p className="text-sm font-medium truncate">
                      {r.users?.full_name ?? r.users?.email ?? "Unknown"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(r.submitted_at)} ·{" "}
                      {changeCountById.get(r.id) ?? 0} change
                      {(changeCountById.get(r.id) ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                  <div className="min-w-0 text-xs text-muted-foreground truncate italic">
                    {r.submitter_note ?? "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {r.reviewed_at ? `Reviewed ${formatDate(r.reviewed_at)}` : ""}
                  </div>
                  <DownloadMenu
                    slug={slug}
                    scope="submission"
                    scopeId={r.id}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "pending_review" | "accepted" | "rejected" | "mixed" | "withdrawn";
}) {
  const config: Record<typeof status, { label: string; className: string }> = {
    pending_review: {
      label: "Pending review",
      className: "bg-cme-yellow/30 text-cme-black border-cme-yellow",
    },
    accepted: {
      label: "Accepted",
      className:
        "bg-cme-bright-green/20 text-cme-dark-green border-cme-bright-green",
    },
    rejected: {
      label: "Rejected",
      className: "bg-cme-red/20 text-cme-red border-cme-red",
    },
    mixed: {
      label: "Mixed",
      className: "bg-cme-blue/20 text-cme-blue border-cme-blue",
    },
    withdrawn: {
      label: "Withdrawn",
      className: "bg-cme-gray/40 text-cme-black border-cme-gray",
    },
  };
  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        c.className,
      )}
    >
      {c.label}
    </span>
  );
}
