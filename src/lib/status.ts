import type { Database } from "@/lib/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_development: "In Development",
  submitted_for_review: "Submitted for Review",
  accepted: "Accepted",
  rejected: "Rejected",
  deferred: "Deferred",
};

// Tailwind utility classes for each status. Colors follow spec §5.
export const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  not_started: "bg-cme-gray/40 text-cme-black border-cme-gray",
  in_development: "bg-cme-yellow/30 text-cme-black border-cme-yellow",
  submitted_for_review: "bg-cme-blue/20 text-cme-blue border-cme-blue",
  accepted: "bg-cme-bright-green/20 text-cme-dark-green border-cme-bright-green",
  rejected: "bg-cme-red/20 text-cme-red border-cme-red",
  deferred: "bg-cme-dark-brown/20 text-cme-dark-brown border-cme-dark-brown",
};

export function formatCurrency(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatCurrencyCents(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
