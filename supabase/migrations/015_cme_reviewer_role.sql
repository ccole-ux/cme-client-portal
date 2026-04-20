-- 015: Add cme_reviewer value to the global role enum.
--
-- CME Reviewers can review submissions from ACTC (accept/reject proposed
-- changes, notify the submitter) but cannot manage users or directly edit
-- canonical data. Think of them as a delegated subset of cme_admin limited
-- to the review path.
--
-- Postgres does not allow newly-added enum values to be referenced in the
-- same transaction they were created in. Policies and helpers that *use*
-- the value ship separately in migration 016.

ALTER TYPE user_global_role ADD VALUE IF NOT EXISTS 'cme_reviewer';
ALTER TYPE project_member_role ADD VALUE IF NOT EXISTS 'cme_reviewer';
