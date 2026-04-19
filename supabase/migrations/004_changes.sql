-- 004: Change management - proposed changes + submissions.

CREATE TYPE change_operation AS ENUM ('create', 'update', 'delete');

CREATE TYPE proposed_change_status AS ENUM (
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'withdrawn',
  'applied'
);

CREATE TYPE submission_status AS ENUM (
  'pending_review',
  'accepted',
  'rejected',
  'mixed',
  'withdrawn'
);

CREATE TABLE change_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitter_id    uuid NOT NULL REFERENCES users(id),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  submitter_note  text,
  status          submission_status NOT NULL DEFAULT 'pending_review',
  reviewer_id     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  reviewer_note   text
);

CREATE INDEX idx_submissions_project   ON change_submissions (project_id, submitted_at DESC);
CREATE INDEX idx_submissions_submitter ON change_submissions (submitter_id);

CREATE TABLE proposed_changes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation           change_operation NOT NULL,
  entity_type         text NOT NULL,
  entity_id           uuid,
  change_data         jsonb NOT NULL,
  status              proposed_change_status NOT NULL DEFAULT 'draft',
  submission_id       uuid REFERENCES change_submissions(id) ON DELETE SET NULL,
  proposed_by         uuid NOT NULL REFERENCES users(id),
  proposed_at         timestamptz NOT NULL DEFAULT now(),
  via_ai              boolean NOT NULL DEFAULT false,
  ai_conversation_id  uuid,
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  review_note         text,
  applied_at          timestamptz
);

CREATE INDEX idx_proposed_project      ON proposed_changes (project_id);
CREATE INDEX idx_proposed_submission   ON proposed_changes (submission_id);
CREATE INDEX idx_proposed_proposer     ON proposed_changes (proposed_by, status);
