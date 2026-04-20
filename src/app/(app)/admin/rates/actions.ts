"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/dal";

export async function updateRateAction(
  rateId: string,
  newRate: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "cme_admin") {
    return { ok: false, error: "Only CME admins can edit rates." };
  }
  if (!Number.isFinite(newRate) || newRate <= 0) {
    return { ok: false, error: "Rate must be a positive number." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("resource_rate_history")
    .update({ rate_loaded: newRate })
    .eq("id", rateId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/rates");
  return { ok: true };
}
