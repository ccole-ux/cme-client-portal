import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadCanonicalWorkplan,
  loadWorkplanFromSnapshot,
} from "@/lib/export/workplan-data";
import { renderWorkplanCsv } from "@/lib/export/csv";
import { renderWorkplanXlsx } from "@/lib/export/excel";
import { renderWorkplanPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

type Format = "pdf" | "xlsx" | "csv";

/**
 * GET /api/export/workplan/draft?format=pdf|xlsx|csv
 * GET /api/export/workplan/canonical?format=pdf|xlsx|csv
 * GET /api/export/workplan/submission/[id]?format=pdf|xlsx|csv
 * GET /api/export/workplan/version/[id]?format=pdf|xlsx|csv
 *
 * All routes enforce visibility rules from spec §12 and log an audit row.
 * Project resolution is done via query string (?project=slug) — the client
 * builds this via the DownloadMenu component which passes `slug`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scope: string[] }> },
) {
  const { scope } = await params;
  const url = request.nextUrl;
  const format = (url.searchParams.get("format") ?? "pdf") as Format;
  const slugParam = url.searchParams.get("project");

  if (!["pdf", "xlsx", "csv"].includes(format)) {
    return NextResponse.json(
      { error: "format must be pdf, xlsx, or csv" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role;

  const scopeKind = scope[0] as "draft" | "canonical" | "submission" | "version";
  const scopeId = scope[1];

  // Resolve project — scope determines how we look it up.
  let projectId: string | null = null;
  let projectSlug: string | null = null;
  let snapshotRow: Awaited<ReturnType<typeof loadSnapshot>> | null = null;

  if (scopeKind === "submission" || scopeKind === "version") {
    if (!scopeId) {
      return NextResponse.json(
        { error: "Missing snapshot id" },
        { status: 400 },
      );
    }
    const lookup = await loadSnapshot(
      supabase,
      scopeKind === "version" ? "accepted_version" : "submission",
      scopeId,
    );
    if (!lookup) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    snapshotRow = lookup;
    projectId = lookup.project_id;

    if (scopeKind === "submission") {
      // spec §12: submission visibility — submitter OR cme_staff.
      const isStaff = role === "cme_admin" || role === "cme_viewer";
      if (!isStaff && snapshotRow.submission_id) {
        const { data: sub } = await supabase
          .from("change_submissions")
          .select("submitter_id")
          .eq("id", snapshotRow.submission_id)
          .maybeSingle();
        if (!sub || sub.submitter_id !== user.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }
  } else {
    if (!slugParam) {
      return NextResponse.json(
        { error: "Missing ?project=<slug>" },
        { status: 400 },
      );
    }
    const { data: project } = await supabase
      .from("projects")
      .select("id, slug")
      .eq("slug", slugParam)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = project.id;
    projectSlug = project.slug;
  }

  if (!projectId) {
    return NextResponse.json({ error: "Project not resolved" }, { status: 400 });
  }

  // Build the ExportWorkplan according to scope.
  let workplan;
  if (scopeKind === "canonical") {
    workplan = await loadCanonicalWorkplan(
      supabase,
      projectId,
      "Canonical Baseline",
    );
  } else if (scopeKind === "draft") {
    // For now, draft export renders canonical + annotates pending drafts in
    // the version label. A true overlay would require materializing drafts —
    // we skip that in v1 since the Drafts tray already shows diffs.
    const { count } = await supabase
      .from("proposed_changes")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("proposed_by", user.id)
      .eq("status", "draft");
    if (!count || count === 0) {
      return NextResponse.json(
        { error: "You have no drafts on this project" },
        { status: 400 },
      );
    }
    workplan = await loadCanonicalWorkplan(
      supabase,
      projectId,
      `Canonical + your ${count} draft${count === 1 ? "" : "s"}`,
    );
  } else if (scopeKind === "submission" || scopeKind === "version") {
    if (!snapshotRow) {
      return NextResponse.json({ error: "Snapshot missing" }, { status: 404 });
    }
    workplan = await loadWorkplanFromSnapshot(supabase, snapshotRow);
  } else {
    return NextResponse.json({ error: "Unknown scope" }, { status: 400 });
  }

  // Render.
  let body: Buffer | string;
  let mime: string;
  let ext: string;
  try {
    if (format === "csv") {
      body = renderWorkplanCsv(workplan);
      mime = "text/csv";
      ext = "csv";
    } else if (format === "xlsx") {
      body = await renderWorkplanXlsx(workplan);
      mime =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else {
      body = await renderWorkplanPdf(workplan);
      mime = "application/pdf";
      ext = "pdf";
    }
  } catch (err) {
    console.error("[export] render failed", err);
    return NextResponse.json(
      { error: `Render failed: ${String(err)}` },
      { status: 500 },
    );
  }

  // Audit log.
  await supabase.from("audit_log").insert({
    project_id: projectId,
    actor_id: user.id,
    action: "export.generate",
    entity_type: "workplan",
    entity_id: scopeId ?? null,
    payload: {
      scope: scopeKind,
      format,
      project_slug: projectSlug ?? snapshotRow?.project_id ?? null,
    },
  });

  const slug = projectSlug ?? workplan.project.slug;
  const filename = buildFilename(slug, scopeKind, scopeId, ext);

  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function loadSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: "accepted_version" | "submission",
  idOrSubmissionId: string,
): Promise<{
  project_id: string;
  snapshot_type: string;
  snapshot_label: string | null;
  version_number: number;
  captured_at: string;
  data: unknown;
  narrative_data: unknown;
  submission_id: string | null;
} | null> {
  // For submission scope, caller may pass either a workplan_snapshots.id or a
  // change_submissions.id. We try snapshot id first and fall back to
  // submission_id lookup.
  const { data: bySnapId } = await supabase
    .from("workplan_snapshots")
    .select(
      "project_id, snapshot_type, snapshot_label, version_number, captured_at, data, narrative_data, submission_id",
    )
    .eq("id", idOrSubmissionId)
    .eq("snapshot_type", type)
    .maybeSingle();
  if (bySnapId) return bySnapId;

  if (type === "submission") {
    const { data: bySubId } = await supabase
      .from("workplan_snapshots")
      .select(
        "project_id, snapshot_type, snapshot_label, version_number, captured_at, data, narrative_data, submission_id",
      )
      .eq("submission_id", idOrSubmissionId)
      .eq("snapshot_type", type)
      .maybeSingle();
    if (bySubId) return bySubId;
  }

  return null;
}

function buildFilename(
  slug: string,
  scope: string,
  scopeId: string | undefined,
  ext: string,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const tag = scopeId ? `${scope}-${scopeId.slice(0, 8)}` : scope;
  return `${slug.toUpperCase()}-${tag}-${today}.${ext}`;
}
