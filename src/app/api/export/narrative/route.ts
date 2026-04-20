import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCanonicalWorkplan } from "@/lib/export/workplan-data";
import { renderNarrativePdf } from "@/lib/export/narrative-pdf";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const slug = url.searchParams.get("project");
  const format = url.searchParams.get("format") ?? "pdf";
  if (!slug) {
    return NextResponse.json(
      { error: "Missing ?project=<slug>" },
      { status: 400 },
    );
  }
  if (format !== "pdf") {
    return NextResponse.json({ error: "Narrative only supports PDF" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const wp = await loadCanonicalWorkplan(
    supabase,
    project.id,
    "Status Narrative",
  );
  const buf = await renderNarrativePdf(wp);

  await supabase.from("audit_log").insert({
    project_id: project.id,
    actor_id: user.id,
    action: "export.generate",
    entity_type: "narrative",
    entity_id: null,
    payload: { scope: "narrative", format: "pdf" },
  });

  const filename = `${slug.toUpperCase()}-narrative-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(buf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
