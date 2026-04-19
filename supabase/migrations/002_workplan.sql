-- 002: Workplan tasks, resources, rate history.

CREATE TYPE task_status AS ENUM (
  'not_started',
  'in_development',
  'submitted_for_review',
  'accepted',
  'rejected',
  'deferred'
);

CREATE TABLE resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  firm                text NOT NULL,
  b7_classification   text,
  role_description    text,
  avatar_url          text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_firm ON resources (firm);

CREATE TABLE resource_rate_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id      uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  effective_from   date NOT NULL,
  effective_to     date,
  rate_loaded      numeric(10,2) NOT NULL,
  rate_source      text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_rate_history_resource ON resource_rate_history (resource_id, effective_from);

CREATE TABLE workplan_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wbs                text NOT NULL,
  parent_wbs         text,
  task_name          text NOT NULL,
  phase              text,
  start_date         date,
  finish_date        date,
  notes              text,
  status             task_status NOT NULL DEFAULT 'not_started',
  status_updated_at  timestamptz,
  status_updated_by  uuid REFERENCES users(id),
  is_milestone       boolean NOT NULL DEFAULT false,
  is_published       boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES users(id),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES users(id),
  UNIQUE (project_id, wbs)
);

CREATE INDEX idx_workplan_tasks_project ON workplan_tasks (project_id);
CREATE INDEX idx_workplan_tasks_phase   ON workplan_tasks (project_id, phase);
CREATE INDEX idx_workplan_tasks_status  ON workplan_tasks (project_id, status);

CREATE TABLE workplan_task_resources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES workplan_tasks(id) ON DELETE CASCADE,
  resource_id     uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  hours           numeric(10,2) NOT NULL DEFAULT 0,
  cost_override   numeric(14,2),
  notes           text,
  UNIQUE (task_id, resource_id)
);

CREATE INDEX idx_wtr_task     ON workplan_task_resources (task_id);
CREATE INDEX idx_wtr_resource ON workplan_task_resources (resource_id);
