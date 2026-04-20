import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  computeCostForTaskResource,
  type RateHistoryRow,
} from "@/lib/rates/compute";

type TaskRow = Database["public"]["Tables"]["workplan_tasks"]["Row"];
type WtrRow = Database["public"]["Tables"]["workplan_task_resources"]["Row"];
type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type RateRow = Database["public"]["Tables"]["resource_rate_history"]["Row"];

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

/**
 * Fetch a project by slug, or 404 if missing/unauthorized. RLS enforces the
 * read permission — if the current user can't see the row, we get null and
 * treat it as a 404.
 */
export const getProjectBySlugOrNotFound = cache(
  async (slug: string): Promise<ProjectRow> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) notFound();
    return data;
  },
);

export type TaskWithCost = {
  task: TaskRow;
  assignments: (WtrRow & { resource: ResourceRow | null })[];
  total_hours: number;
  total_cost: number;
  rate_missing: boolean;
};

export async function getTasksWithCosts(
  projectId: string,
): Promise<TaskWithCost[]> {
  const supabase = await createClient();

  const [tasksRes, wtrRes, ratesRes] = await Promise.all([
    supabase
      .from("workplan_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("workplan_task_resources")
      .select("*, resource:resources(*), workplan_tasks!inner(project_id)")
      .eq("workplan_tasks.project_id", projectId),
    supabase.from("resource_rate_history").select("*"),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (wtrRes.error) throw wtrRes.error;
  if (ratesRes.error) throw ratesRes.error;

  const ratesByResource = new Map<string, RateHistoryRow[]>();
  for (const r of ratesRes.data as RateRow[]) {
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

  const wtrByTask = new Map<
    string,
    (WtrRow & { resource: ResourceRow | null })[]
  >();
  for (const row of wtrRes.data as unknown as (WtrRow & {
    resource: ResourceRow | null;
  })[]) {
    const list = wtrByTask.get(row.task_id) ?? [];
    list.push(row);
    wtrByTask.set(row.task_id, list);
  }

  const result: TaskWithCost[] = [];
  for (const task of tasksRes.data as TaskRow[]) {
    const assignments = wtrByTask.get(task.id) ?? [];
    let total_hours = 0;
    let total_cost = 0;
    let rate_missing = false;
    for (const a of assignments) {
      total_hours += Number(a.hours);
      if (!task.start_date || !task.finish_date) continue;
      const rates = ratesByResource.get(a.resource_id) ?? [];
      try {
        const c = computeCostForTaskResource(
          {
            start_date: task.start_date,
            finish_date: task.finish_date,
            hours: Number(a.hours),
          },
          rates,
        );
        total_cost += c.total_cost;
      } catch {
        rate_missing = true;
      }
    }
    result.push({ task, assignments, total_hours, total_cost, rate_missing });
  }
  return result;
}

export type ResourceWithHoursAndRates = {
  resource: ResourceRow;
  rates: RateRow[];
  total_hours: number;
  total_cost: number;
};

export async function getResourcesForProject(
  projectId: string,
): Promise<ResourceWithHoursAndRates[]> {
  const supabase = await createClient();
  const [resourcesRes, ratesRes, wtrRes] = await Promise.all([
    supabase.from("resources").select("*").order("full_name"),
    supabase
      .from("resource_rate_history")
      .select("*")
      .order("effective_from"),
    supabase
      .from("workplan_task_resources")
      .select("hours, resource_id, workplan_tasks!inner(project_id, start_date, finish_date)")
      .eq("workplan_tasks.project_id", projectId),
  ]);

  if (resourcesRes.error) throw resourcesRes.error;
  if (ratesRes.error) throw ratesRes.error;
  if (wtrRes.error) throw wtrRes.error;

  const ratesByResource = new Map<string, RateRow[]>();
  for (const r of ratesRes.data!) {
    const list = ratesByResource.get(r.resource_id) ?? [];
    list.push(r);
    ratesByResource.set(r.resource_id, list);
  }

  type WtrJoin = {
    hours: number;
    resource_id: string;
    workplan_tasks: {
      project_id: string;
      start_date: string | null;
      finish_date: string | null;
    };
  };
  const hoursByResource = new Map<
    string,
    { hours: number; cost: number }
  >();
  for (const w of wtrRes.data as unknown as WtrJoin[]) {
    const current = hoursByResource.get(w.resource_id) ?? {
      hours: 0,
      cost: 0,
    };
    current.hours += Number(w.hours);
    const rates = ratesByResource.get(w.resource_id) ?? [];
    if (w.workplan_tasks.start_date && w.workplan_tasks.finish_date) {
      try {
        const c = computeCostForTaskResource(
          {
            start_date: w.workplan_tasks.start_date,
            finish_date: w.workplan_tasks.finish_date,
            hours: Number(w.hours),
          },
          rates.map((r) => ({
            effective_from: r.effective_from,
            effective_to: r.effective_to,
            rate_loaded: Number(r.rate_loaded),
            rate_source: r.rate_source ?? "",
          })),
        );
        current.cost += c.total_cost;
      } catch {
        // leave cost as-is
      }
    }
    hoursByResource.set(w.resource_id, current);
  }

  return (resourcesRes.data ?? []).map((r) => ({
    resource: r,
    rates: ratesByResource.get(r.id) ?? [],
    total_hours: hoursByResource.get(r.id)?.hours ?? 0,
    total_cost: hoursByResource.get(r.id)?.cost ?? 0,
  }));
}
