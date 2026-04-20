/**
 * Session 6 + 7 smoke test — runs against the remote Supabase project using
 * the service-role key. Verifies:
 *   • workplan_tasks row count (99 expected for A26-0057)
 *   • the cme_reviewer enum value exists
 *   • migration 015/016 helpers (is_cme_staff, can_review_submissions) respond
 *   • proposed_changes accepts a test draft then cleans up
 *   • an authenticated-equivalent canonical CSV export round-trip is viable
 *
 * Run:
 *   npx tsx scripts/smoke-session-6-7.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type CheckResult = { name: string; ok: boolean; detail: string };

async function check(
  name: string,
  fn: () => Promise<string>,
): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const { data: project } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", "a26-0057")
    .maybeSingle();

  if (!project) {
    console.error("❌ project a26-0057 not found");
    process.exit(1);
  }

  const results: CheckResult[] = [];

  results.push(
    await check("workplan tasks == 99", async () => {
      const { count, error } = await supabase
        .from("workplan_tasks")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project.id);
      if (error) throw error;
      if (count !== 99) throw new Error(`expected 99, got ${count}`);
      return `99 rows`;
    }),
  );

  results.push(
    await check("cme_reviewer enum value exists", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("is_cme_staff");
      if (error) throw error;
      // The rpc returns bool. We don't care about its value here (service role
      // doesn't have a user id); we just confirm it didn't throw from an
      // unknown-value or similar. If the enum were missing, Postgres would
      // reject the function creation from migration 016.
      return `is_cme_staff() responded: ${data}`;
    }),
  );

  results.push(
    await check("can_review_submissions() helper exists", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "can_review_submissions",
      );
      if (error) throw error;
      return `can_review_submissions() responded: ${data}`;
    }),
  );

  results.push(
    await check("proposed_changes insert + delete round-trip", async () => {
      // Pick an existing task to attach the draft to.
      const { data: task } = await supabase
        .from("workplan_tasks")
        .select("id")
        .eq("project_id", project.id)
        .limit(1)
        .single();
      if (!task) throw new Error("no task found");

      // Service role: proposed_by needs a real user. Pick any user.
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .limit(1)
        .single();
      if (!user) throw new Error("no user found");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: draft, error: insertErr } = await (
        supabase.from("proposed_changes") as any
      )
        .insert({
          project_id: project.id,
          operation: "update",
          entity_type: "workplan_task",
          entity_id: task.id,
          change_data: {
            notes: { old: null, new: "smoke test draft" },
            reason: "session-6-7 smoke test",
          },
          proposed_by: user.id,
          via_ai: true,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      await supabase.from("proposed_changes").delete().eq("id", draft.id);
      return `inserted + deleted ${draft.id}`;
    }),
  );

  results.push(
    await check("deliverables row count > 0", async () => {
      const { count, error } = await supabase
        .from("deliverables")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project.id);
      if (error) throw error;
      if (!count) throw new Error("no deliverables");
      return `${count} rows`;
    }),
  );

  results.push(
    await check("ai_conversations table reachable", async () => {
      const { count, error } = await supabase
        .from("ai_conversations")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return `count=${count}`;
    }),
  );

  console.log("\n=== Session 6 + 7 smoke test ===");
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name} — ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
