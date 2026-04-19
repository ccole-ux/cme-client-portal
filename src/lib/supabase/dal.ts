import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { Database } from "./types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireUser = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
});

export const getCurrentProfile = cache(async (): Promise<UserRow | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data ?? null;
});

export const requireCmeAdmin = cache(async () => {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "cme_admin") {
    redirect("/");
  }
  return profile;
});
