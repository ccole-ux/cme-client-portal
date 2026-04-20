import Link from "next/link";
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

export const metadata = { title: "Activity — CME Client Portal" };

const PAGE_SIZE = 50;

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const isCmeAdmin = profile?.role === "cme_admin";

  const supabase = await createClient();

  // Pull submissions, comments, documents, snapshots, + audit (admin only).
  const [submissionsRes, commentsRes, docsRes, snapshotsRes] =
    await Promise.all([
      supabase
        .from("change_submissions")
        .select(
          "id, submitted_at, submitter_note, status, reviewed_at, users:users!change_submissions_submitter_id_fkey(full_name, email)",
        )
        .eq("project_id", project.id)
        .order("submitted_at", { ascending: false })
        .limit(PAGE_SIZE * 2),
      supabase
        .from("comments")
        .select(
          "id, entity_type, entity_id, body_markdown, created_at, users:users!comments_author_id_fkey(full_name, email)",
        )
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE * 2),
      supabase
        .from("documents")
        .select(
          "id, title, version, uploaded_at, users:users!documents_uploaded_by_fkey(full_name, email)",
        )
        .eq("project_id", project.id)
        .order("uploaded_at", { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from("workplan_snapshots")
        .select("id, snapshot_type, snapshot_label, captured_at, version_number")
        .eq("project_id", project.id)
        .order("captured_at", { ascending: false })
        .limit(PAGE_SIZE),
    ]);

  type Event = {
    at: string;
    kind: "submission" | "comment" | "document" | "snapshot";
    author: string;
    summary: string;
    href?: string;
  };

  const events: Event[] = [];

  for (const s of submissionsRes.data ?? []) {
    type S = {
      id: string;
      submitted_at: string;
      submitter_note: string | null;
      status: string;
      reviewed_at: string | null;
      users: { full_name: string | null; email: string } | null;
    };
    const row = s as unknown as S;
    events.push({
      at: row.submitted_at,
      kind: "submission",
      author: row.users?.full_name ?? row.users?.email ?? "Unknown",
      summary: `submitted a change set (${row.status})`,
      href: `/p/${slug}/submissions`,
    });
    if (row.reviewed_at) {
      events.push({
        at: row.reviewed_at,
        kind: "submission",
        author: "CME Admin",
        summary: `reviewed a submission — ${row.status}`,
        href: `/p/${slug}/submissions`,
      });
    }
  }

  for (const c of commentsRes.data ?? []) {
    type C = {
      id: string;
      entity_type: string;
      entity_id: string;
      body_markdown: string;
      created_at: string;
      users: { full_name: string | null; email: string } | null;
    };
    const row = c as unknown as C;
    events.push({
      at: row.created_at,
      kind: "comment",
      author: row.users?.full_name ?? row.users?.email ?? "Unknown",
      summary: `commented on ${row.entity_type.replace("_", " ")}: "${row.body_markdown.slice(0, 80)}${row.body_markdown.length > 80 ? "…" : ""}"`,
      href:
        row.entity_type === "workplan_task"
          ? `/p/${slug}/gantt?task=${row.entity_id}`
          : undefined,
    });
  }

  for (const d of docsRes.data ?? []) {
    type D = {
      id: string;
      title: string;
      version: number;
      uploaded_at: string;
      users: { full_name: string | null; email: string } | null;
    };
    const row = d as unknown as D;
    events.push({
      at: row.uploaded_at,
      kind: "document",
      author: row.users?.full_name ?? row.users?.email ?? "Unknown",
      summary: `uploaded "${row.title}" (v${row.version})`,
      href: `/p/${slug}/documents`,
    });
  }

  for (const s of snapshotsRes.data ?? []) {
    events.push({
      at: s.captured_at,
      kind: "snapshot",
      author: "Portal",
      summary: `captured ${s.snapshot_type} v${s.version_number}: ${s.snapshot_label ?? ""}`,
      href: `/p/${slug}/versions`,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  const start = (page - 1) * PAGE_SIZE;
  const pageEvents = events.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));

  return (
    <div className="max-w-4xl px-8 py-6 space-y-6">
      <div>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          TIMELINE
        </p>
        <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
          ACTIVITY
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {events.length} events · page {page} of {totalPages}
          {isCmeAdmin && (
            <>
              {" · "}
              <Link
                href="/admin/audit"
                className="text-cme-bright-green hover:underline"
              >
                View full audit log
              </Link>
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide text-sm">
            CHRONOLOGICAL FEED
          </CardTitle>
          <CardDescription>
            Submissions, comments, documents, and snapshot captures across the
            whole project.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y border-t">
            {pageEvents.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="px-5 py-3 flex items-start gap-3"
              >
                <KindDot kind={e.kind} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{e.author}</span>{" "}
                    <span className="text-muted-foreground">{e.summary}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(e.at)} · {new Date(e.at).toLocaleTimeString()}
                  </p>
                </div>
                {e.href && (
                  <Link
                    href={e.href}
                    className="text-[11px] text-cme-bright-green hover:underline"
                  >
                    Open →
                  </Link>
                )}
              </li>
            ))}
            {pageEvents.length === 0 && (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                No activity yet.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-4 text-sm">
          {page > 1 && (
            <Link
              href={`/p/${slug}/activity?page=${page - 1}`}
              className="hover:text-cme-dark-green"
            >
              ← Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/p/${slug}/activity?page=${page + 1}`}
              className="hover:text-cme-dark-green"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function KindDot({ kind }: { kind: "submission" | "comment" | "document" | "snapshot" }) {
  const colors: Record<typeof kind, string> = {
    submission: "bg-cme-bright-green",
    comment: "bg-cme-blue",
    document: "bg-cme-yellow",
    snapshot: "bg-cme-dark-green",
  };
  return (
    <span
      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${colors[kind]}`}
      aria-label={kind}
    />
  );
}
