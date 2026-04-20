-- 010: Additional deliverables metadata from rA1 contract sheet.
-- Columns added to keep contract-level context queryable without overloading
-- `description` or `notes`. See session 3 kickoff + Chris's seed guidance.

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS owner_initials text,
  ADD COLUMN IF NOT EXISTS frequency      text,
  ADD COLUMN IF NOT EXISTS phase_tag      text,
  ADD COLUMN IF NOT EXISTS delivery_note  text;
