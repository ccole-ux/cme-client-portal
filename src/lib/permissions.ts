import type { UserGlobalRole } from "@/lib/supabase/types";

/**
 * Can this role accept/reject submitted changes?
 *
 * Mirrors the Postgres `can_review_submissions()` SECURITY DEFINER function so
 * that client-side permission checks don't need a round-trip to the DB. Keep
 * the two in sync when adding new roles.
 */
export function canReviewSubmissions(
  role: UserGlobalRole | null | undefined,
): boolean {
  return role === "cme_admin" || role === "cme_reviewer";
}

/**
 * Can this role invite users / edit canonical data directly? Only CME Admin.
 */
export function isCmeAdmin(
  role: UserGlobalRole | null | undefined,
): boolean {
  return role === "cme_admin";
}

/**
 * Is this an internal CME staff role (admin, reviewer, or viewer)?
 */
export function isCmeStaff(
  role: UserGlobalRole | null | undefined,
): boolean {
  return (
    role === "cme_admin" ||
    role === "cme_reviewer" ||
    role === "cme_viewer"
  );
}
