-- 005: Workplan snapshots (submission / accepted_version / manual).
-- See spec sections 6 and 12.

CREATE TYPE snapshot_type AS ENUM ('submission', 'accepted_version', 'manual');

CREATE TABLE workplan_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_type   snapshot_type NOT NULL,
  snapshot_label  text,
  version_number  integer NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  captured_by     uuid NOT NULL REFERENCES users(id),
  submission_id   uuid REFERENCES change_submissions(id) ON DELETE SET NULL,
  data            jsonb NOT NULL,
  narrative_data  jsonb,
  notes           text,
  UNIQUE (project_id, snapshot_type, version_number)
);

CREATE INDEX idx_snapshots_project_type ON workplan_snapshots (project_id, snapshot_type);
CREATE INDEX idx_snapshots_submission   ON workplan_snapshots (submission_id);
