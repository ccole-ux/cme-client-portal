/**
 * Session 3 seed: loads the ACTC PCS workplan, rate history, narrative,
 * deliverables, and initial baseline snapshot into Supabase.
 *
 * Run with: npx tsx scripts/seed-from-workplan.ts
 * Idempotent — re-running produces no duplicates.
 */
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { generateEscalatedRates } from "../src/lib/rates/compute";

process.loadEnvFile(".env.local");

const WORKPLAN_PATH = resolve("docs/ACTC_PCS_Workplan_v8.xlsx");
const NARRATIVE_PATH = resolve("docs/PCS_Status_Narrative.md");
const PROJECT_SLUG = "actc-pcs";
const CME_ADMIN_EMAIL = "ccole@cole-mgtandeng.com";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type ResourceSeed = {
  full_name: string;
  firm: string;
  b7_classification: string;
  role_description: string;
  rate_2026: number;
  last_name: string;
};

function log(phase: string, msg: string) {
  console.log(`[${phase}] ${msg}`);
}

function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function readWorkbook() {
  return XLSX.read(readFileSync(WORKPLAN_PATH), { cellDates: true });
}

function phaseFromWbs(wbs: string): string | null {
  if (wbs.startsWith("1.5")) return "1.5";
  if (/^1(\.|$)/.test(wbs)) return "1";
  if (/^2(\.|$)/.test(wbs)) return "2";
  if (/^3(\.|$)/.test(wbs)) return "3";
  if (/^PM(\.|$)/i.test(wbs)) return "PM";
  if (/^M\d/.test(wbs)) return null;
  return null;
}

// -----------------------------------------------------------------------------
// Phase A — resources
// -----------------------------------------------------------------------------
async function phaseA(wb: XLSX.WorkBook): Promise<Map<string, string>> {
  const ws = wb.Sheets["PCS Workplan v8"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Resource Summary block: R225-R232 (0-indexed 224-231)
  const seeds: ResourceSeed[] = [];
  for (let i = 224; i <= 231; i++) {
    const row = rows[i];
    if (!row) continue;
    const fullName = String(row[0] ?? "").trim();
    if (!fullName) continue;
    const firm = String(row[1] ?? "").trim();
    const b7Classification = String(row[2] ?? "").trim();
    const rate2026 = Number(row[3]);
    const roleDesc = String(row[6] ?? "").trim();
    const lastName = fullName.split(/\s+/).slice(-1)[0];
    seeds.push({
      full_name: fullName,
      firm,
      b7_classification: b7Classification,
      role_description: roleDesc,
      rate_2026: rate2026,
      last_name: lastName,
    });
  }

  if (seeds.length !== 8) {
    throw new Error(
      `Expected 8 resources in xlsx Resource Summary, got ${seeds.length}`,
    );
  }

  const idByLastName = new Map<string, string>();
  let inserted = 0;

  for (const s of seeds) {
    const { data: existing } = await supabase
      .from("resources")
      .select("id, full_name")
      .eq("full_name", s.full_name)
      .maybeSingle();

    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const { data, error } = await supabase
        .from("resources")
        .insert({
          full_name: s.full_name,
          firm: s.firm,
          b7_classification: s.b7_classification,
          role_description: s.role_description,
          is_active: true,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("resource insert failed");
      id = data.id;
      inserted += 1;
    }
    idByLastName.set(s.last_name, id);
  }

  log("A", `resources: ${inserted} inserted, ${seeds.length - inserted} already present`);

  // Stash seed rates for Phase B by sneaking them onto the map.
  (idByLastName as unknown as { __seeds: ResourceSeed[] }).__seeds = seeds;
  return idByLastName;
}

// -----------------------------------------------------------------------------
// Phase B — rate history
// -----------------------------------------------------------------------------
async function phaseB(idByLastName: Map<string, string>) {
  const seeds = (idByLastName as unknown as { __seeds: ResourceSeed[] })
    .__seeds;
  let inserted = 0;
  let skipped = 0;

  for (const s of seeds) {
    const resourceId = idByLastName.get(s.last_name)!;
    const rates = generateEscalatedRates(
      s.rate_2026,
      2026,
      2028,
      "B7 R26-003 2026",
    );
    for (const rate of rates) {
      const { data: existing } = await supabase
        .from("resource_rate_history")
        .select("id")
        .eq("resource_id", resourceId)
        .eq("effective_from", rate.effective_from)
        .maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from("resource_rate_history").insert({
        resource_id: resourceId,
        effective_from: rate.effective_from,
        effective_to: rate.effective_to,
        rate_loaded: rate.rate_loaded,
        rate_source: rate.rate_source,
      });
      if (error) throw error;
      inserted += 1;
    }
  }

  log("B", `rate_history: ${inserted} inserted, ${skipped} already present`);
}

// -----------------------------------------------------------------------------
// Phase C — project
// -----------------------------------------------------------------------------
async function phaseC(): Promise<string> {
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", PROJECT_SLUG)
    .maybeSingle();
  if (existing) {
    log("C", `project "${PROJECT_SLUG}" already exists (${existing.id})`);
    return existing.id;
  }

  const description =
    "Alameda CTC PCS SaaS Replacement. 4,912 hours / $1,356,256 across four phases (May 2026 – Apr 2027) to replace the legacy Project Controls System with a Supabase-backed SaaS platform covering Programming, Projects, Contracts, Invoices, Funding, AI-assisted workflows, and Tableau reporting.";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: "PCS SaaS Replacement",
      client_name: "Alameda County Transportation Commission",
      client_short: "Alameda CTC",
      slug: PROJECT_SLUG,
      baseline_year: 2026,
      kickoff_on: "2026-05-01",
      status: "active",
      started_on: null,
      target_complete_on: "2027-04-30",
      total_hours_baseline: 4912,
      total_cost_baseline: 1356256,
      description,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("project insert failed");
  log("C", `project inserted (${data.id})`);
  return data.id;
}

// -----------------------------------------------------------------------------
// Phase D — tasks + resource assignments
// Phase E — milestones (done alongside since they share the same table)
// -----------------------------------------------------------------------------
type ParsedTask = {
  wbs: string;
  task_name: string;
  phase: string | null;
  start_date: string | null;
  finish_date: string | null;
  is_milestone: boolean;
  sort_order: number;
  assignments: { last_name: string; hours: number; notes: string | null }[];
};

function parseWorkplanTasks(wb: XLSX.WorkBook): ParsedTask[] {
  const ws = wb.Sheets["PCS Workplan v8"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const byWbs = new Map<string, ParsedTask>();
  const milestones: ParsedTask[] = [];

  // Header at row 5 (0-indexed 4). Data begins row 6 (index 5).
  // Stop at the Resource Summary area around row 220.
  for (let i = 5; i < 220; i++) {
    const row = rows[i];
    if (!row) continue;
    const wbs = String(row[0] ?? "").trim();
    const name = String(row[1] ?? "").trim();
    if (!wbs || !name) continue;

    // Section-header rows ("PHASE 1: CORE MVP", "Phase 2 Subtotal", "GRAND
    // TOTAL") and WBS-group rows ("1.0 Database Learning...") are skipped
    // naturally by the resource/hours check below — they have no assignment.
    // Don't filter by name regex: real task names can start with "Phase"
    // (e.g. "Phase 1.5 documentation & testing" at WBS 1.5A.3).

    // Milestone row (M1 … M8; M3.5). Has a finish date but no resource.
    if (/^M\d/.test(wbs)) {
      const finish = toISODate(row[3]);
      milestones.push({
        wbs,
        task_name: name.replace(/^★\s*/, ""),
        phase: null,
        start_date: finish,
        finish_date: finish,
        is_milestone: true,
        sort_order: i,
        assignments: [],
      });
      continue;
    }

    const start = toISODate(row[2]);
    const finish = toISODate(row[3]);
    const resource = row[4] ? String(row[4]).trim() : null;
    const hours = row[5] != null && row[5] !== "" ? Number(row[5]) : null;
    const notes = row[7] ? String(row[7]).trim() : null;

    // Must have a resource + hours to be considered a task assignment.
    if (!resource || hours == null || Number.isNaN(hours)) continue;

    let task = byWbs.get(wbs);
    if (!task) {
      task = {
        wbs,
        task_name: name,
        phase: phaseFromWbs(wbs),
        start_date: start,
        finish_date: finish,
        is_milestone: false,
        sort_order: i,
        assignments: [],
      };
      byWbs.set(wbs, task);
    }
    task.assignments.push({ last_name: resource, hours, notes });
  }

  return [...byWbs.values(), ...milestones];
}

async function phaseDE(
  projectId: string,
  idByLastName: Map<string, string>,
  wb: XLSX.WorkBook,
) {
  const parsed = parseWorkplanTasks(wb);
  const taskRows = parsed.filter((t) => !t.is_milestone);
  const milestoneRows = parsed.filter((t) => t.is_milestone);

  // Upsert tasks by (project_id, wbs)
  const taskPayload = parsed.map((t) => ({
    project_id: projectId,
    wbs: t.wbs,
    task_name: t.task_name,
    phase: t.phase,
    start_date: t.start_date,
    finish_date: t.finish_date,
    is_milestone: t.is_milestone,
    is_published: true,
    sort_order: t.sort_order,
    status: "not_started" as const,
  }));

  const { error: upsertErr } = await supabase
    .from("workplan_tasks")
    .upsert(taskPayload, {
      onConflict: "project_id,wbs",
      ignoreDuplicates: true,
    });
  if (upsertErr) throw upsertErr;

  // Fetch task ids keyed by wbs
  const { data: persisted, error: fetchErr } = await supabase
    .from("workplan_tasks")
    .select("id, wbs")
    .eq("project_id", projectId);
  if (fetchErr) throw fetchErr;
  const taskIdByWbs = new Map(persisted!.map((t) => [t.wbs, t.id]));

  log(
    "D",
    `tasks: ${taskRows.length} non-milestone WBS, ${milestoneRows.length} milestones; total persisted ${persisted!.length}`,
  );

  // Upsert workplan_task_resources
  const assignmentPayload: {
    task_id: string;
    resource_id: string;
    hours: number;
    notes: string | null;
  }[] = [];
  const missingResources = new Set<string>();
  for (const task of taskRows) {
    const taskId = taskIdByWbs.get(task.wbs);
    if (!taskId) throw new Error(`task id missing for wbs ${task.wbs}`);
    for (const a of task.assignments) {
      const resourceId = idByLastName.get(a.last_name);
      if (!resourceId) {
        missingResources.add(a.last_name);
        continue;
      }
      assignmentPayload.push({
        task_id: taskId,
        resource_id: resourceId,
        hours: a.hours,
        notes: a.notes,
      });
    }
  }

  if (missingResources.size) {
    throw new Error(
      `Unknown resource names in xlsx: ${[...missingResources].join(", ")}`,
    );
  }

  const { error: wtrErr } = await supabase
    .from("workplan_task_resources")
    .upsert(assignmentPayload, {
      onConflict: "task_id,resource_id",
      ignoreDuplicates: true,
    });
  if (wtrErr) throw wtrErr;

  log("D", `task_resources: ${assignmentPayload.length} rows upserted`);
  log("E", `milestones included in workplan_tasks above`);
}

// -----------------------------------------------------------------------------
// Phase F — deliverables
// Column mapping (Chris-confirmed, 2026-04-19):
//   A Seq            → ref_code, sort_order
//   C Deliverable    → title AND description (no separate description col in sheet)
//   D Owner          → owner_initials (e.g., "CC/MN")
//   E Freq           → frequency (e.g., "Annually", "As req")
//   F Delivery       → delivery_note (raw text; not parseable as a date)
//   G WBS Ref        → wbs_links (comma-split, strip trailing parentheticals)
//   H Status         → phase_tag (e.g., "Phase 1", "Phase 1-3")
// due_date left null. Rows where col A is non-integer (TASK/OPTIONAL headers)
// are skipped.
// -----------------------------------------------------------------------------
function parseWbsLinks(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => s.replace(/\s*\([^)]*\)$/, "")) // strip trailing parenthetical
    .filter(Boolean);
}

async function phaseF(projectId: string, wb: XLSX.WorkBook) {
  const ws = wb.Sheets["Contract Deliverables (rA1)"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const deliverablePayload: {
    project_id: string;
    ref_code: string;
    title: string;
    description: string | null;
    wbs_links: string[];
    due_date: null;
    status: "not_started";
    sort_order: number;
    owner_initials: string | null;
    frequency: string | null;
    phase_tag: string | null;
    delivery_note: string | null;
  }[] = [];

  let skippedNonInteger = 0;

  // Header at row 4 (index 3). Data begins row 5 (index 4).
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const colA = row[0] != null ? String(row[0]).trim() : "";
    const title = row[2] != null ? String(row[2]).trim() : "";
    if (!colA || !title) continue;

    // Must parse cleanly as an integer. This filters TASK/OPTIONAL headers.
    const ref = Number(colA);
    if (!Number.isInteger(ref)) {
      skippedNonInteger += 1;
      continue;
    }

    const owner = row[3] != null ? String(row[3]).trim() : null;
    const freq = row[4] != null ? String(row[4]).trim() : null;
    const delivery = row[5] != null ? String(row[5]).trim() : null;
    const wbsRaw = row[6] != null ? String(row[6]) : null;
    const phaseTag = row[7] != null ? String(row[7]).trim() : null;

    deliverablePayload.push({
      project_id: projectId,
      ref_code: String(ref),
      title,
      description: title, // no separate description column in sheet
      wbs_links: parseWbsLinks(wbsRaw),
      due_date: null,
      status: "not_started",
      sort_order: ref,
      owner_initials: owner,
      frequency: freq,
      phase_tag: phaseTag,
      delivery_note: delivery,
    });
  }

  const { error } = await supabase
    .from("deliverables")
    .upsert(deliverablePayload, {
      onConflict: "project_id,ref_code",
      ignoreDuplicates: true,
    });
  if (error) throw error;
  log(
    "F",
    `deliverables: ${deliverablePayload.length} rows upserted (skipped ${skippedNonInteger} section-header rows)`,
  );
}

// -----------------------------------------------------------------------------
// Phase G — narrative
// -----------------------------------------------------------------------------
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function phaseG(projectId: string) {
  const raw = readFileSync(NARRATIVE_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  type Section = { title: string; body: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  const payload = sections.map((s, idx) => ({
    project_id: projectId,
    section_key: slugify(s.title),
    title: s.title,
    body_markdown: s.body.join("\n").trim(),
    sort_order: idx + 1,
    is_published: true,
    version: 1,
  }));

  const { error } = await supabase.from("narrative_sections").upsert(payload, {
    onConflict: "project_id,section_key",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  log("G", `narrative: ${payload.length} sections upserted`);
}

// -----------------------------------------------------------------------------
// Phase H — initial baseline snapshot
// -----------------------------------------------------------------------------
async function phaseH(projectId: string) {
  const { data: existing } = await supabase
    .from("workplan_snapshots")
    .select("id")
    .eq("project_id", projectId)
    .eq("snapshot_type", "accepted_version")
    .eq("snapshot_label", "v8 Baseline Apr 19 2026")
    .maybeSingle();

  if (existing) {
    log("H", `baseline snapshot already present (${existing.id})`);
    return;
  }

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", CME_ADMIN_EMAIL)
    .maybeSingle();
  if (adminErr) throw adminErr;
  if (!admin) {
    throw new Error(
      `CME admin user ${CME_ADMIN_EMAIL} not found — sign in once via /login before running the seed.`,
    );
  }

  const [tasksRes, wtrRes, narrativeRes] = await Promise.all([
    supabase.from("workplan_tasks").select("*").eq("project_id", projectId),
    supabase
      .from("workplan_task_resources")
      .select("*, workplan_tasks!inner(project_id)")
      .eq("workplan_tasks.project_id", projectId),
    supabase
      .from("narrative_sections")
      .select("*")
      .eq("project_id", projectId),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (wtrRes.error) throw wtrRes.error;
  if (narrativeRes.error) throw narrativeRes.error;

  const data = {
    tasks: tasksRes.data,
    task_resources: wtrRes.data,
  };
  const narrative_data = { narrative_sections: narrativeRes.data };

  const { error } = await supabase.from("workplan_snapshots").insert({
    project_id: projectId,
    snapshot_type: "accepted_version",
    snapshot_label: "v8 Baseline Apr 19 2026",
    version_number: 1, // trigger overrides to max+1
    captured_by: admin.id,
    data,
    narrative_data,
    notes:
      "Initial baseline captured at Session 3 seed. All tasks Not Started per pre-kickoff state.",
  });
  if (error) throw error;
  log("H", `baseline snapshot inserted`);
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------
async function main() {
  console.log(`Seeding from ${WORKPLAN_PATH}`);
  const wb = readWorkbook();
  const idByLastName = await phaseA(wb);
  await phaseB(idByLastName);
  const projectId = await phaseC();
  await phaseDE(projectId, idByLastName, wb);
  await phaseF(projectId, wb);
  await phaseG(projectId);
  await phaseH(projectId);
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:");
  console.error(err);
  process.exit(1);
});
