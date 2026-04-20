import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { loadGanttData } from "@/lib/projects/gantt";
import {
  computeCostForTaskResource,
  type RateHistoryRow,
} from "@/lib/rates/compute";

export type ToolExecContext = {
  projectId: string;
  userId: string;
  conversationId: string | null;
  role: string;
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

/**
 * Caller's role buckets the allowed tool set:
 * - query tools: every authenticated role
 * - propose tools: anyone except actc_viewer (read-only)
 */
const PROPOSE_TOOL_NAMES = new Set([
  "propose_task_update",
  "propose_new_task",
  "propose_delete_task",
]);

export function canInvokeTool(role: string, toolName: string): boolean {
  if (PROPOSE_TOOL_NAMES.has(toolName)) {
    return role !== "actc_viewer";
  }
  return true;
}

export async function runTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<ToolResult> {
  if (!canInvokeTool(ctx.role, toolName)) {
    return {
      ok: false,
      error: `Role ${ctx.role} cannot invoke ${toolName}. Ask a user with propose permission.`,
    };
  }

  const supabase = await createClient();

  try {
    switch (toolName) {
      case "query_workplan":
        return await runQueryWorkplan(supabase, ctx, toolInput);
      case "query_costs":
        return await runQueryCosts(supabase, ctx, toolInput);
      case "query_deliverables":
        return await runQueryDeliverables(supabase, ctx, toolInput);
      case "search_narrative":
        return await runSearchNarrative(supabase, ctx, toolInput);
      case "query_rate_history":
        return await runQueryRateHistory(supabase, toolInput);
      case "propose_task_update":
        return await runProposeTaskUpdate(supabase, ctx, toolInput);
      case "propose_new_task":
        return await runProposeNewTask(supabase, ctx, toolInput);
      case "propose_delete_task":
        return await runProposeDeleteTask(supabase, ctx, toolInput);
      default:
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Query tools
// ---------------------------------------------------------------------------

type Sb = SupabaseClient<Database>;

async function runQueryWorkplan(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const phase = typeof input.phase === "string" ? input.phase : null;
  const status = typeof input.status === "string" ? input.status : null;
  const search = typeof input.search === "string" ? input.search : null;
  const includeMilestones =
    typeof input.include_milestones === "boolean"
      ? input.include_milestones
      : true;
  const criticalOnly =
    typeof input.critical_only === "boolean" ? input.critical_only : false;

  let query = supabase
    .from("workplan_tasks")
    .select("id, wbs, task_name, phase, start_date, finish_date, status, is_milestone, sort_order")
    .eq("project_id", ctx.projectId)
    .order("sort_order");

  if (phase) query = query.eq("phase", phase);
  // Workplan_tasks.status is enum-typed in Postgres; cast to satisfy TS.
  if (status)
    query = query.eq(
      "status",
      status as Database["public"]["Enums"]["task_status"],
    );
  if (!includeMilestones) query = query.eq("is_milestone", false);
  if (search) query = query.or(`task_name.ilike.%${search}%,wbs.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  let rows = data ?? [];
  if (criticalOnly) {
    const gantt = await loadGanttData(ctx.projectId);
    const critical = new Set<string>();
    for (const [id, a] of gantt.analysis) {
      if (a.is_on_critical_path) critical.add(id);
    }
    rows = rows.filter((r) => critical.has(r.id));
  }

  // Cap payload to keep context windows tidy.
  const truncated = rows.length > 50;
  return {
    ok: true,
    data: {
      count: rows.length,
      truncated,
      tasks: rows.slice(0, 50),
    },
  };
}

async function runQueryCosts(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const dimension = String(input.dimension);
  const metric = String(input.metric);

  const [tasksRes, wtrRes, ratesRes] = await Promise.all([
    supabase
      .from("workplan_tasks")
      .select("id, phase, start_date, finish_date, is_milestone")
      .eq("project_id", ctx.projectId),
    supabase
      .from("workplan_task_resources")
      .select(
        "hours, resource_id, task_id, resource:resources(firm, full_name), workplan_tasks!inner(project_id)",
      )
      .eq("workplan_tasks.project_id", ctx.projectId),
    supabase.from("resource_rate_history").select("*"),
  ]);

  if (tasksRes.error) return { ok: false, error: tasksRes.error.message };
  if (wtrRes.error) return { ok: false, error: wtrRes.error.message };
  if (ratesRes.error) return { ok: false, error: ratesRes.error.message };

  const tasks = tasksRes.data ?? [];
  const wtr = (wtrRes.data ?? []) as unknown as Array<{
    hours: number;
    resource_id: string;
    task_id: string;
    resource: { firm: string | null; full_name: string | null } | null;
  }>;
  const ratesByResource = new Map<string, RateHistoryRow[]>();
  for (const r of ratesRes.data ?? []) {
    const list = ratesByResource.get(r.resource_id) ?? [];
    list.push({
      id: r.id,
      resource_id: r.resource_id,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      rate_loaded: Number(r.rate_loaded),
      rate_source: r.rate_source ?? "",
    });
    ratesByResource.set(r.resource_id, list);
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const buckets = new Map<string, { hours: number; cost: number }>();

  for (const a of wtr) {
    const task = taskById.get(a.task_id);
    if (!task || task.is_milestone) continue;
    if (!task.start_date || !task.finish_date) continue;
    const hours = Number(a.hours);

    let bucketKey: string;
    switch (dimension) {
      case "firm":
        bucketKey = a.resource?.firm ?? "Unknown";
        break;
      case "resource":
        bucketKey = a.resource?.full_name ?? "Unknown";
        break;
      case "phase":
        bucketKey = task.phase ?? "Unknown";
        break;
      case "month": {
        const m = task.start_date.slice(0, 7);
        bucketKey = m;
        break;
      }
      case "total":
      default:
        bucketKey = "total";
        break;
    }

    let cost = 0;
    try {
      const c = computeCostForTaskResource(
        {
          start_date: task.start_date,
          finish_date: task.finish_date,
          hours,
        },
        ratesByResource.get(a.resource_id) ?? [],
      );
      cost = c.total_cost;
    } catch {
      // skip rate-missing rows
    }

    const cur = buckets.get(bucketKey) ?? { hours: 0, cost: 0 };
    cur.hours += hours;
    cur.cost += cost;
    buckets.set(bucketKey, cur);
  }

  const rows = Array.from(buckets.entries())
    .map(([key, v]) => ({
      key,
      hours: Math.round(v.hours * 10) / 10,
      cost: Math.round(v.cost * 100) / 100,
    }))
    .sort((a, b) =>
      metric === "hours" ? b.hours - a.hours : b.cost - a.cost,
    );

  return { ok: true, data: { dimension, metric, rows } };
}

async function runQueryDeliverables(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const taskNumber =
    typeof input.task_number === "string" ? input.task_number : null;
  const owner = typeof input.owner === "string" ? input.owner : null;

  let query = supabase
    .from("deliverables")
    .select(
      "ref_code, title, phase_tag, owner_initials, frequency, delivery_note, wbs_links, sort_order, status",
    )
    .eq("project_id", ctx.projectId)
    .order("sort_order");

  // Deliverables don't have a parent_task_number column; infer from the WBS
  // prefix instead (wbs_links stores strings like "2.4.3").
  if (taskNumber) query = query.contains("wbs_links", [taskNumber]);
  if (owner) query = query.ilike("owner_initials", `%${owner}%`);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: { count: data?.length ?? 0, deliverables: data ?? [] },
  };
}

async function runSearchNarrative(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const q = String(input.query ?? "");
  if (!q.trim()) return { ok: false, error: "query is required" };

  const { data, error } = await supabase
    .from("narrative_sections")
    .select("title, body_markdown, sort_order")
    .eq("project_id", ctx.projectId)
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,body_markdown.ilike.%${q}%`)
    .order("sort_order");

  if (error) return { ok: false, error: error.message };

  // Trim long bodies to avoid blowing the context window.
  const sections = (data ?? []).map((s) => ({
    title: s.title,
    excerpt: (s.body_markdown ?? "").slice(0, 1500),
  }));
  return { ok: true, data: { count: sections.length, sections } };
}

async function runQueryRateHistory(
  supabase: Sb,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const name =
    typeof input.resource_name === "string" ? input.resource_name : null;
  const year = typeof input.year === "number" ? input.year : null;

  const { data: resources, error: rErr } = await supabase
    .from("resources")
    .select("id, full_name, firm, b7_classification")
    .order("full_name");
  if (rErr) return { ok: false, error: rErr.message };

  const filteredResources = (resources ?? []).filter((r) => {
    if (!name) return true;
    return (r.full_name ?? "").toLowerCase().includes(name.toLowerCase());
  });

  const ids = filteredResources.map((r) => r.id);
  if (ids.length === 0) {
    return { ok: true, data: { count: 0, rates: [] } };
  }

  const { data: rates, error: ratesErr } = await supabase
    .from("resource_rate_history")
    .select(
      "resource_id, effective_from, effective_to, rate_loaded, rate_source",
    )
    .in("resource_id", ids)
    .order("effective_from");
  if (ratesErr) return { ok: false, error: ratesErr.message };

  const nameById = new Map(filteredResources.map((r) => [r.id, r.full_name]));
  const firmById = new Map(filteredResources.map((r) => [r.id, r.firm]));

  let rows = (rates ?? []).map((r) => ({
    resource: nameById.get(r.resource_id) ?? r.resource_id,
    firm: firmById.get(r.resource_id) ?? "",
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    rate_loaded: Number(r.rate_loaded),
    rate_source: r.rate_source,
  }));

  if (year) {
    rows = rows.filter((r) => {
      const from = new Date(r.effective_from);
      const to = r.effective_to ? new Date(r.effective_to) : new Date("2099-12-31");
      return from.getFullYear() <= year && to.getFullYear() >= year;
    });
  }

  return { ok: true, data: { count: rows.length, rates: rows } };
}

// ---------------------------------------------------------------------------
// Propose tools — all create DRAFT rows in proposed_changes with via_ai=true.
// RLS ensures drafts are scoped to the caller's user id.
// ---------------------------------------------------------------------------

async function runProposeTaskUpdate(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const taskId = String(input.task_id ?? "");
  const fieldUpdates = (input.field_updates ?? {}) as Record<string, unknown>;
  const reason = String(input.reason ?? "");

  if (!taskId) return { ok: false, error: "task_id is required" };
  if (Object.keys(fieldUpdates).length === 0) {
    return { ok: false, error: "field_updates must include at least one field" };
  }

  const { data: task } = await supabase
    .from("workplan_tasks")
    .select("id, wbs, task_name, start_date, finish_date, status, notes")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: `task not found: ${taskId}` };

  // Build old/new diff payload so the drafts tray can render it consistently.
  const changeData: Record<string, { old: unknown; new: unknown } | string> =
    {};
  const taskRow = task as Record<string, unknown>;
  for (const [k, v] of Object.entries(fieldUpdates)) {
    changeData[k] = {
      old: taskRow[k] ?? null,
      new: v as unknown,
    };
  }
  changeData.reason = reason;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: draft, error } = await (supabase.from("proposed_changes") as any)
    .insert({
      project_id: ctx.projectId,
      operation: "update",
      entity_type: "workplan_task",
      entity_id: taskId,
      change_data: changeData,
      proposed_by: ctx.userId,
      via_ai: true,
      ai_conversation_id: ctx.conversationId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      draft_id: draft.id,
      task_wbs: task.wbs,
      task_name: task.task_name,
      note: "Draft created. Visit Drafts to review and submit.",
    },
  };
}

async function runProposeNewTask(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const changeData: Record<string, unknown> = {
    task_name: input.task_name,
    wbs: input.wbs,
    phase: input.phase,
    start_date: input.start_date,
    finish_date: input.finish_date,
    hours: input.hours ?? null,
    reason: input.reason,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: draft, error } = await (supabase.from("proposed_changes") as any)
    .insert({
      project_id: ctx.projectId,
      operation: "create",
      entity_type: "workplan_task",
      entity_id: null,
      change_data: changeData,
      proposed_by: ctx.userId,
      via_ai: true,
      ai_conversation_id: ctx.conversationId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      draft_id: draft.id,
      note: "Draft created. Visit Drafts to review and submit.",
    },
  };
}

async function runProposeDeleteTask(
  supabase: Sb,
  ctx: ToolExecContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const taskId = String(input.task_id ?? "");
  const reason = String(input.reason ?? "");
  if (!taskId) return { ok: false, error: "task_id is required" };

  const { data: task } = await supabase
    .from("workplan_tasks")
    .select("wbs, task_name")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: `task not found: ${taskId}` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: draft, error } = await (supabase.from("proposed_changes") as any)
    .insert({
      project_id: ctx.projectId,
      operation: "delete",
      entity_type: "workplan_task",
      entity_id: taskId,
      change_data: { reason, wbs: task.wbs, task_name: task.task_name },
      proposed_by: ctx.userId,
      via_ai: true,
      ai_conversation_id: ctx.conversationId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      draft_id: draft.id,
      task_wbs: task.wbs,
      task_name: task.task_name,
      note: "Draft created. Visit Drafts to review and submit.",
    },
  };
}
