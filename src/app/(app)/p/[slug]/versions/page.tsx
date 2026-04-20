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
import { DownloadMenu } from "@/components/export/DownloadMenu";
import { ManualSnapshotForm } from "./ManualSnapshotForm";

export const metadata = { title: "Versions — CME Client Portal" };

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const isCmeAdmin = profile?.role === "cme_admin";

  const supabase = await createClient();
  const { data: snapshots } = await supabase
    .from("workplan_snapshots")
    .select(
      "id, snapshot_type, snapshot_label, version_number, captured_at, captured_by, users:users!workplan_snapshots_captured_by_fkey(full_name, email)",
    )
    .eq("project_id", project.id)
    .in("snapshot_type", ["accepted_version", "manual"])
    .order("captured_at", { ascending: false });

  const rows = (snapshots ?? []) as unknown as Array<{
    id: string;
    snapshot_type: "accepted_version" | "manual";
    snapshot_label: string | null;
    version_number: number;
    captured_at: string;
    captured_by: string | null;
    users: { full_name: string | null; email: string } | null;
  }>;

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            SNAPSHOTS
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            VERSIONS ({rows.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Accepted baselines are captured automatically when submissions are
            accepted. Manual snapshots capture ad-hoc moments in time.
          </p>
        </div>
        <DownloadMenu slug={slug} scope="canonical" />
      </div>

      {isCmeAdmin && <ManualSnapshotForm projectId={project.id} />}

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No snapshots yet. Accept a submission or capture a manual snapshot
            to create one.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display tracking-wide text-sm">
              ALL VERSIONS
            </CardTitle>
            <CardDescription className="text-xs">
              Download any version as PDF / Excel / CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-4 items-center"
                >
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                      r.snapshot_type === "accepted_version"
                        ? "bg-cme-bright-green/20 text-cme-dark-green border-cme-bright-green"
                        : "bg-cme-gray/40 text-cme-black border-cme-gray"
                    }`}
                  >
                    {r.snapshot_type === "accepted_version" ? "Accepted" : "Manual"} v{r.version_number}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.snapshot_label ?? `Version ${r.version_number}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      by {r.users?.full_name ?? r.users?.email ?? "system"}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(r.captured_at)}
                  </div>
                  <DownloadMenu
                    slug={slug}
                    scope="version"
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
