import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import {
  aggregateByFirm,
  aggregateByMonth,
  aggregateByPhase,
  computeBaselineBurn,
  type TaskResourceRow,
} from "../src/lib/costs/aggregate";
import type { RateHistoryRow } from "../src/lib/rates/compute";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: project } = await supabase
    .from("projects")
    .select("id, slug, total_hours_baseline, total_cost_baseline, kickoff_on, target_complete_on")
    .eq("slug", "a26-0057")
    .single();
  if (!project) throw new Error("project not found");

  const [wtrRes, ratesRes] = await Promise.all([
    supabase
      .from("workplan_task_resources")
      .select(
        "hours, task_id, resource_id, workplan_tasks!inner(wbs, task_name, phase, start_date, finish_date, project_id, is_milestone), resources!inner(full_name, firm)",
      )
      .eq("workplan_tasks.project_id", project.id),
    supabase.from("resource_rate_history").select("*"),
  ]);

  type WtrJoin = {
    hours: number;
    task_id: string;
    resource_id: string;
    workplan_tasks: {
      wbs: string;
      task_name: string;
      phase: string | null;
      start_date: string | null;
      finish_date: string | null;
      is_milestone: boolean;
    };
    resources: { full_name: string; firm: string };
  };

  const rows: TaskResourceRow[] = (wtrRes.data as unknown as WtrJoin[])
    .filter((w) => w.workplan_tasks.start_date && w.workplan_tasks.finish_date)
    .map((w) => ({
      task_id: w.task_id,
      wbs: w.workplan_tasks.wbs,
      task_name: w.workplan_tasks.task_name,
      phase: w.workplan_tasks.phase,
      start_date: w.workplan_tasks.start_date!,
      finish_date: w.workplan_tasks.finish_date!,
      resource_id: w.resource_id,
      resource_name: w.resources.full_name,
      firm: w.resources.firm,
      hours: Number(w.hours),
      is_milestone: w.workplan_tasks.is_milestone,
    }));

  const rates: RateHistoryRow[] = (ratesRes.data ?? []).map((r) => ({
    id: r.id,
    resource_id: r.resource_id,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    rate_loaded: Number(r.rate_loaded),
    rate_source: r.rate_source ?? "",
  }));

  console.log(`Project: ${project.slug}`);
  console.log(
    `Baseline: ${project.total_hours_baseline} hrs · $${project.total_cost_baseline}`,
  );
  console.log(`Rows: ${rows.length} · Rates: ${rates.length}`);

  const byFirm = aggregateByFirm(rows, rates);
  console.log("\n=== By Firm ===");
  for (const a of byFirm) {
    console.log(
      `  ${a.label.padEnd(30)} ${a.hours.toFixed(0).padStart(6)} hrs · $${a.cost.toFixed(2).padStart(12)}`,
    );
  }
  const firmTotal = byFirm.reduce((s, a) => s + a.cost, 0);
  console.log(`  ${"TOTAL".padEnd(30)} ${"".padStart(10)}   $${firmTotal.toFixed(2).padStart(12)}`);

  const byPhase = aggregateByPhase(rows, rates);
  console.log("\n=== By Phase ===");
  for (const a of byPhase) {
    console.log(
      `  ${a.label.padEnd(10)} ${a.hours.toFixed(0).padStart(6)} hrs · $${a.cost.toFixed(2).padStart(12)}`,
    );
  }

  const byMonth = aggregateByMonth(rows, rates);
  console.log("\n=== By Month ===");
  for (const a of byMonth) {
    console.log(
      `  ${a.label.padEnd(10)} ${a.hours.toFixed(0).padStart(6)} hrs · $${a.cost.toFixed(2).padStart(12)}`,
    );
  }
  const monthTotal = byMonth.reduce((s, a) => s + a.cost, 0);
  console.log(`  ${"TOTAL".padEnd(10)} ${"".padStart(10)}   $${monthTotal.toFixed(2).padStart(12)}`);

  const burn = computeBaselineBurn(
    rows,
    rates,
    project.kickoff_on ?? "2026-05-01",
    project.target_complete_on ?? "2027-04-30",
    "week",
  );
  console.log(`\n=== Burn ===`);
  console.log(`  Points: ${burn.length}`);
  console.log(`  First: ${burn[0].date} $${burn[0].planned_cumulative_cost.toFixed(2)}`);
  const last = burn[burn.length - 1];
  console.log(`  Last:  ${last.date} $${last.planned_cumulative_cost.toFixed(2)}`);

  const baselineTarget = Number(project.total_cost_baseline);
  const diff = Math.abs(firmTotal - baselineTarget);
  const pct = (diff / baselineTarget) * 100;
  console.log(`\n=== Baseline check ===`);
  console.log(`  Firm total: $${firmTotal.toFixed(2)}`);
  console.log(`  Baseline:   $${baselineTarget.toFixed(2)}`);
  console.log(`  Diff:       $${diff.toFixed(2)} (${pct.toFixed(2)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
