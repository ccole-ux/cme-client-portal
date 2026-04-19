-- 003: Deliverables and narrative sections.

CREATE TYPE deliverable_status AS ENUM (
  'not_started',
  'in_development',
  'submitted_for_review',
  'accepted',
  'rejected',
  'deferred'
);

CREATE TABLE deliverables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref_code      text NOT NULL,
  title         text NOT NULL,
  description   text,
  wbs_links     text[] NOT NULL DEFAULT '{}',
  due_date      date,
  status        deliverable_status NOT NULL DEFAULT 'not_started',
  evidence_url  text,
  notes         text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, ref_code)
);

CREATE INDEX idx_deliverables_project ON deliverables (project_id);
CREATE INDEX idx_deliverables_status  ON deliverables (project_id, status);

CREATE TABLE narrative_sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_key    text NOT NULL,
  title          text NOT NULL,
  body_markdown  text NOT NULL DEFAULT '',
  sort_order     integer NOT NULL DEFAULT 0,
  is_published   boolean NOT NULL DEFAULT false,
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, section_key)
);

CREATE INDEX idx_narrative_project ON narrative_sections (project_id);
