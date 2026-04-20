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
import { DocumentUploader } from "./DocumentUploader";
import { DocumentDownloadButton } from "./DocumentDownloadButton";

export const metadata = { title: "Documents — CME Client Portal" };

const CATEGORY_ORDER = [
  "Contracts & Agreements",
  "Workplans",
  "Reports",
  "Specifications",
  "Other",
];

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const canUpload =
    profile?.role === "cme_admin" || profile?.role === "cme_viewer";

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select(
      "id, title, description, storage_path, file_size, mime_type, version, uploaded_at, uploaded_by, supersedes_id, users:users!documents_uploaded_by_fkey(full_name, email)",
    )
    .eq("project_id", project.id)
    .order("uploaded_at", { ascending: false });

  type Doc = {
    id: string;
    title: string;
    description: string | null;
    storage_path: string;
    file_size: number | null;
    mime_type: string | null;
    version: number;
    uploaded_at: string;
    uploaded_by: string;
    supersedes_id: string | null;
    users: { full_name: string | null; email: string } | null;
  };

  const rows = (docs ?? []) as unknown as Doc[];

  // Group by title — latest version first, superseded versions hidden behind
  // a "version history" link on the latest row.
  const byTitle = new Map<string, Doc[]>();
  for (const d of rows) {
    const list = byTitle.get(d.title) ?? [];
    list.push(d);
    byTitle.set(d.title, list);
  }
  for (const list of byTitle.values()) {
    list.sort((a, b) => b.version - a.version);
  }
  const latestOnly = Array.from(byTitle.values()).map((list) => list[0]);

  // Assign categories from description tag (if present) or bucket to "Other".
  const byCategory = new Map<string, Doc[]>();
  for (const d of latestOnly) {
    const tag = detectCategory(d);
    const list = byCategory.get(tag) ?? [];
    list.push(d);
    byCategory.set(tag, list);
  }

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          PROJECT LIBRARY
        </p>
        <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
          DOCUMENTS ({latestOnly.length})
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Versioned document storage. Upload a document with the same title to
          create a new version.
        </p>
      </div>

      {canUpload && <DocumentUploader projectId={project.id} />}

      {CATEGORY_ORDER.map((cat) => {
        const items = byCategory.get(cat) ?? [];
        if (items.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="font-display tracking-wide text-sm">
                {cat.toUpperCase()}
              </CardTitle>
              <CardDescription className="text-xs">
                {items.length} document{items.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y border-t">
                {items.map((d) => {
                  const versions = byTitle.get(d.title) ?? [];
                  return (
                    <li
                      key={d.id}
                      className="px-5 py-3 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {d.title}
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                            v{d.version}
                          </span>
                        </p>
                        {d.description && (
                          <p className="text-xs text-muted-foreground">
                            {d.description}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {humanSize(d.file_size)} · {d.mime_type ?? ""} ·{" "}
                          uploaded by {d.users?.full_name ?? d.users?.email}{" "}
                          on {formatDate(d.uploaded_at)}
                          {versions.length > 1 && (
                            <>
                              {" · "}
                              <span title={versions.map((v) => `v${v.version}`).join(", ")}>
                                {versions.length} versions
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <DocumentDownloadButton id={d.id} />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {latestOnly.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No documents uploaded yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function detectCategory(d: {
  title: string;
  description: string | null;
}): string {
  const hay = `${d.title} ${d.description ?? ""}`.toLowerCase();
  if (hay.includes("contract") || hay.includes("agreement")) {
    return "Contracts & Agreements";
  }
  if (hay.includes("workplan") || hay.includes("schedule") || hay.includes("wbs")) {
    return "Workplans";
  }
  if (hay.includes("report") || hay.includes("status")) return "Reports";
  if (hay.includes("spec") || hay.includes("requirement")) {
    return "Specifications";
  }
  return "Other";
}

function humanSize(bytes: number | null): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
