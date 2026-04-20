-- 016: Wire cme_reviewer into helper functions + RLS policies.
--
-- Separated from 015 because Postgres refuses to reference a freshly-added
-- enum value inside the same transaction (SQLSTATE 55P04).

-- Helpers ------------------------------------------------------------------

-- is_cme_staff now includes reviewer. Anywhere that granted "read the
-- workplan + related data to internal CME eyes" now also applies to
-- reviewers.
CREATE OR REPLACE FUNCTION is_cme_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('cme_admin', 'cme_reviewer', 'cme_viewer')
  );
$$;

-- New helper for submission review gates (API routes + RLS policies).
CREATE OR REPLACE FUNCTION can_review_submissions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('cme_admin', 'cme_reviewer')
  );
$$;

-- RLS policies -------------------------------------------------------------
--
-- Admin paths still own direct canonical writes through cs_admin_write and
-- pc_admin_write. We add dedicated review-scope UPDATE policies so CME
-- Reviewers can mark submissions as reviewed and flip proposed_changes
-- between 'submitted' → 'accepted'/'rejected'/'applied' without granting
-- broader DML. Writes still happen through the /api/submissions/:id/review
-- route which is additionally role-checked at the handler level; these
-- policies are belt-and-suspenders if a reviewer ever hits the Supabase API
-- directly.

DROP POLICY IF EXISTS cs_reviewer_update ON change_submissions;
CREATE POLICY cs_reviewer_update ON change_submissions FOR UPDATE
  USING (can_review_submissions())
  WITH CHECK (can_review_submissions());

DROP POLICY IF EXISTS pc_reviewer_update ON proposed_changes;
CREATE POLICY pc_reviewer_update ON proposed_changes FOR UPDATE
  USING (can_review_submissions())
  WITH CHECK (can_review_submissions());
