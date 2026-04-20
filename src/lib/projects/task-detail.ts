import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  computeCostForTaskResource,
  type CostPeriodBreakdown,
} from "@/lib/rates/compute";

export type ResourceAssignmentDetail = {
  resource_id: string;
  resource_name: string;
  firm: string;
  hours: number;
  cost: number;
  breakdown: CostPeriodBreakdown[];
};

export async function getTaskAssignmentDetail(
  taskId: string,
): Promise<ResourceAssignmentDetail[]> {
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("workplan_tasks")
    .select("start_date, finish_date")
    .eq("id", taskId)
    .single();
  if (!task?.start_date || !task?.finish_date) return [];

  const { data: wtr } = await supabase
    .from("workplan_task_resources")
    .select("hours, resource_id, resource:resources(full_name, firm)")
    .eq("task_id", taskId);

  if (!wtr || wtr.length === 0) return [];

  const { data: rates } = await supabase
    .from("resource_rate_history")
    .select("*")
    .in(
      "resource_id",
      wtr.map((a) => a.resource_id),
    );
  const ratesByResource = new Map<string, typeof rates>();
  for (const r of rates ?? []) {
    const list = ratesByResource.get(r.resource_id) ?? [];
    list.push(r);
    ratesByResource.set(r.resource_id, list);
  }

  return wtr.map((a) => {
    const assignedRates = ratesByResource.get(a.resource_id) ?? [];
    let cost = 0;
    let breakdown: CostPeriodBreakdown[] = [];
    try {
      const c = computeCostForTaskResource(
        {
          start_date: task.start_date!,
          finish_date: task.finish_date!,
          hours: Number(a.hours),
        },
        assignedRates.map((r) => ({
          effective_from: r.effective_from,
          effective_to: r.effective_to,
          rate_loaded: Number(r.rate_loaded),
          rate_source: r.rate_source ?? "",
        })),
      );
      cost = c.total_cost;
      breakdown = c.breakdown;
    } catch {
      // rate coverage gap — leave 0
    }
    const res = a.resource as unknown as {
      full_name: string;
      firm: string;
    } | null;
    return {
      resource_id: a.resource_id,
      resource_name: res?.full_name ?? "Unknown",
      firm: res?.firm ?? "",
      hours: Number(a.hours),
      cost,
      breakdown,
    };
  });
}
