-- ==============================================================
-- 001_users_and_projects.sql
-- ==============================================================
-- CME Client Portal — Session 2 schema
-- 001: Users, projects, project membership.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Global role assigned to each user. Scoped per-project via project_members.role.
CREATE TYPE user_global_role AS ENUM (
  'cme_admin',
  'cme_viewer',
  'actc_reviewer',
  'actc_viewer'
);

CREATE TYPE project_member_role AS ENUM (
  'cme_admin',
  'cme_viewer',
  'actc_reviewer',
  'actc_viewer'
);

CREATE TYPE project_status AS ENUM (
  'prospective',
  'active',
  'on_hold',
  'closed'
);

CREATE TABLE users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  full_name     text,
  firm          text,
  avatar_url    text,
  role          user_global_role NOT NULL DEFAULT 'actc_viewer',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (lower(email));

CREATE TABLE projects (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  client_name            text NOT NULL,
  client_short           text NOT NULL,
  slug                   text NOT NULL UNIQUE,
  baseline_year          integer NOT NULL,
  kickoff_on             date,
  status                 project_status NOT NULL DEFAULT 'prospective',
  started_on             date,
  target_complete_on     date,
  total_hours_baseline   numeric(12,2),
  total_cost_baseline    numeric(14,2),
  description            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_slug ON projects (slug);

CREATE TABLE project_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         project_member_role NOT NULL,
  invited_by   uuid REFERENCES users(id),
  invited_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_user   ON project_members (user_id);
CREATE INDEX idx_project_members_project ON project_members (project_id);

-- ==============================================================
-- 002_workplan.sql
-- ==============================================================
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

-- ==============================================================
-- 003_deliverables_narrative.sql
-- ==============================================================
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

-- ==============================================================
-- 004_changes.sql
-- ==============================================================
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

-- ==============================================================
-- 005_snapshots.sql
-- ==============================================================
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

-- ==============================================================
-- 006_ai.sql
-- ==============================================================
-- 006: AI assistant conversations and messages.

CREATE TYPE ai_message_role AS ENUM ('user', 'assistant', 'tool', 'system');

CREATE TABLE ai_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conv_user ON ai_conversations (user_id, last_message_at DESC);

CREATE TABLE ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             ai_message_role NOT NULL,
  content          text,
  tool_name        text,
  tool_args        jsonb,
  tool_result      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_msg_conv ON ai_messages (conversation_id, created_at);

-- Backfill FK added after ai_conversations exists (proposed_changes.ai_conversation_id from 004).
ALTER TABLE proposed_changes
  ADD CONSTRAINT fk_proposed_changes_ai_conversation
  FOREIGN KEY (ai_conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL;

-- ==============================================================
-- 007_ops.sql
-- ==============================================================
-- 007: Operational tables - comments, documents, audit log, notifications.

CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES users(id),
  body_markdown     text NOT NULL,
  mentions          uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES users(id)
);

CREATE INDEX idx_comments_entity  ON comments (entity_type, entity_id);
CREATE INDEX idx_comments_project ON comments (project_id, created_at DESC);

CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  storage_path   text NOT NULL,
  file_size      bigint,
  mime_type      text,
  version        integer NOT NULL DEFAULT 1,
  uploaded_by    uuid NOT NULL REFERENCES users(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  supersedes_id  uuid REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_documents_project ON documents (project_id, uploaded_at DESC);

CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  payload      jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_project ON audit_log (project_id, created_at DESC);
CREATE INDEX idx_audit_actor   ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log (action, created_at DESC);

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  payload      jsonb,
  seen_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

-- ==============================================================
-- 008_rls.sql
-- ==============================================================
-- 008: Row Level Security policies and helper functions.
-- Mirrors spec section 3 role matrix + section 12 export visibility.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_cme_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'cme_admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_cme_viewer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'cme_viewer'
  );
$$;

CREATE OR REPLACE FUNCTION is_cme_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role IN ('cme_admin', 'cme_viewer')
  );
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

-- Enable RLS on every table. Explicit per-table policies follow.
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources                ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_rate_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workplan_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workplan_task_resources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables             ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposed_changes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workplan_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE POLICY users_select ON users FOR SELECT
  USING (id = auth.uid() OR is_cme_staff());

CREATE POLICY users_update_self ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_admin_write ON users FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE POLICY projects_select ON projects FOR SELECT
  USING (is_cme_staff() OR is_project_member(id));

CREATE POLICY projects_admin_write ON projects FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------------
CREATE POLICY pm_select ON project_members FOR SELECT
  USING (is_cme_staff() OR is_project_member(project_id));

CREATE POLICY pm_admin_write ON project_members FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- resources / rate history (global catalog readable by all authenticated users)
-- ---------------------------------------------------------------------------
CREATE POLICY resources_select ON resources FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY resources_admin_write ON resources FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

CREATE POLICY rate_history_select ON resource_rate_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY rate_history_admin_write ON resource_rate_history FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- workplan_tasks — CME staff see all; others only published
-- ---------------------------------------------------------------------------
CREATE POLICY workplan_tasks_select ON workplan_tasks FOR SELECT
  USING (
    (is_cme_staff() AND is_project_member(project_id))
    OR is_cme_staff()
    OR (is_project_member(project_id) AND is_published = true)
  );

CREATE POLICY workplan_tasks_admin_write ON workplan_tasks FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

CREATE POLICY wtr_select ON workplan_task_resources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workplan_tasks t
      WHERE t.id = task_id AND (
        is_cme_staff()
        OR (is_project_member(t.project_id) AND t.is_published = true)
      )
    )
  );

CREATE POLICY wtr_admin_write ON workplan_task_resources FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------
CREATE POLICY deliverables_select ON deliverables FOR SELECT
  USING (
    is_cme_staff() OR is_project_member(project_id)
  );

CREATE POLICY deliverables_admin_write ON deliverables FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- narrative_sections — gated by is_published for non-staff
-- ---------------------------------------------------------------------------
CREATE POLICY narrative_select ON narrative_sections FOR SELECT
  USING (
    is_cme_staff()
    OR (is_project_member(project_id) AND is_published = true)
  );

CREATE POLICY narrative_admin_write ON narrative_sections FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- proposed_changes — visible to proposer + CME staff; any project member may draft
-- ---------------------------------------------------------------------------
CREATE POLICY pc_select ON proposed_changes FOR SELECT
  USING (proposed_by = auth.uid() OR is_cme_staff());

CREATE POLICY pc_insert ON proposed_changes FOR INSERT
  WITH CHECK (
    proposed_by = auth.uid()
    AND is_project_member(project_id)
  );

CREATE POLICY pc_update_own_draft ON proposed_changes FOR UPDATE
  USING (proposed_by = auth.uid() AND status = 'draft')
  WITH CHECK (proposed_by = auth.uid());

CREATE POLICY pc_admin_write ON proposed_changes FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- change_submissions — submitter + CME staff
-- ---------------------------------------------------------------------------
CREATE POLICY cs_select ON change_submissions FOR SELECT
  USING (submitter_id = auth.uid() OR is_cme_staff());

CREATE POLICY cs_insert ON change_submissions FOR INSERT
  WITH CHECK (submitter_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY cs_update_own ON change_submissions FOR UPDATE
  USING (submitter_id = auth.uid() AND status = 'pending_review')
  WITH CHECK (submitter_id = auth.uid());

CREATE POLICY cs_admin_write ON change_submissions FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- workplan_snapshots — visibility varies by type (spec section 12)
-- ---------------------------------------------------------------------------
CREATE POLICY snapshots_submission_select ON workplan_snapshots FOR SELECT
  USING (
    snapshot_type = 'submission'
    AND (
      is_cme_staff()
      OR EXISTS (
        SELECT 1 FROM change_submissions cs
        WHERE cs.id = workplan_snapshots.submission_id
          AND cs.submitter_id = auth.uid()
      )
    )
  );

CREATE POLICY snapshots_accepted_select ON workplan_snapshots FOR SELECT
  USING (
    snapshot_type = 'accepted_version'
    AND (is_cme_staff() OR is_project_member(project_id))
  );

CREATE POLICY snapshots_manual_select ON workplan_snapshots FOR SELECT
  USING (
    snapshot_type = 'manual'
    AND (is_cme_staff() OR is_project_member(project_id))
  );

CREATE POLICY snapshots_admin_write ON workplan_snapshots FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

-- ---------------------------------------------------------------------------
-- AI conversations / messages — owner + cme_admin
-- ---------------------------------------------------------------------------
CREATE POLICY ai_conv_owner ON ai_conversations FOR ALL
  USING (user_id = auth.uid() OR is_cme_admin())
  WITH CHECK (user_id = auth.uid() OR is_cme_admin());

CREATE POLICY ai_msg_owner ON ai_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR is_cme_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR is_cme_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- comments — readable per project; insert by any project member; update/delete by author
-- ---------------------------------------------------------------------------
CREATE POLICY comments_select ON comments FOR SELECT
  USING (is_cme_staff() OR is_project_member(project_id));

CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (is_cme_staff() OR is_project_member(project_id))
  );

CREATE POLICY comments_update_own ON comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY comments_delete_own ON comments FOR DELETE
  USING (author_id = auth.uid() OR is_cme_admin());

-- ---------------------------------------------------------------------------
-- documents — readable per project; writable by CME staff
-- ---------------------------------------------------------------------------
CREATE POLICY documents_select ON documents FOR SELECT
  USING (is_cme_staff() OR is_project_member(project_id));

CREATE POLICY documents_staff_write ON documents FOR ALL
  USING (is_cme_staff())
  WITH CHECK (is_cme_staff());

-- ---------------------------------------------------------------------------
-- audit_log — readable by cme_admin; DML is trigger-only (no policies for insert)
-- ---------------------------------------------------------------------------
CREATE POLICY audit_select ON audit_log FOR SELECT
  USING (is_cme_admin());

-- No INSERT/UPDATE/DELETE policies — writes happen through SECURITY DEFINER triggers.

-- ---------------------------------------------------------------------------
-- notifications — recipient only
-- ---------------------------------------------------------------------------
CREATE POLICY notifications_recipient ON notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ==============================================================
-- 009_triggers.sql
-- ==============================================================
-- 009: Shared triggers - updated_at, audit_log, snapshot auto-version.

-- ---------------------------------------------------------------------------
-- set_updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_workplan_tasks_updated_at
  BEFORE UPDATE ON workplan_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deliverables_updated_at
  BEFORE UPDATE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_narrative_updated_at
  BEFORE UPDATE ON narrative_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log_trigger — records old/new JSONB on mutating tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_entity_id  uuid;
  v_payload    jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD)->>'id')::uuid;
    v_project_id := (to_jsonb(OLD)->>'project_id')::uuid;
    v_payload := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := (to_jsonb(NEW)->>'id')::uuid;
    v_project_id := (to_jsonb(NEW)->>'project_id')::uuid;
    v_payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_entity_id := (to_jsonb(NEW)->>'id')::uuid;
    v_project_id := (to_jsonb(NEW)->>'project_id')::uuid;
    v_payload := jsonb_build_object('new', to_jsonb(NEW));
  END IF;

  INSERT INTO audit_log (project_id, actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_project_id,
    auth.uid(),
    lower(TG_OP) || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    v_payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_workplan_tasks
  AFTER INSERT OR UPDATE OR DELETE ON workplan_tasks
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_wtr
  AFTER INSERT OR UPDATE OR DELETE ON workplan_task_resources
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_deliverables
  AFTER INSERT OR UPDATE OR DELETE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_narrative
  AFTER INSERT OR UPDATE OR DELETE ON narrative_sections
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_rate_history
  AFTER INSERT OR UPDATE OR DELETE ON resource_rate_history
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_proposed_changes
  AFTER INSERT OR UPDATE OR DELETE ON proposed_changes
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_change_submissions
  AFTER INSERT OR UPDATE OR DELETE ON change_submissions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON workplan_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER trg_audit_project_members
  AFTER INSERT OR UPDATE OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ---------------------------------------------------------------------------
-- auto_increment_snapshot_version
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_increment_snapshot_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number = 0 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO NEW.version_number
      FROM workplan_snapshots
      WHERE project_id = NEW.project_id
        AND snapshot_type = NEW.snapshot_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_auto_version
  BEFORE INSERT ON workplan_snapshots
  FOR EACH ROW EXECUTE FUNCTION auto_increment_snapshot_version();

-- ---------------------------------------------------------------------------
-- Auto-create public.users row when a Supabase auth user is created.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_global_role,
      'actc_viewer'::user_global_role
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ==============================================================
-- 010_deliverables_metadata.sql
-- ==============================================================
-- 010: Additional deliverables metadata from rA1 contract sheet.
-- Columns added to keep contract-level context queryable without overloading
-- `description` or `notes`. See session 3 kickoff + Chris's seed guidance.

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS owner_initials text,
  ADD COLUMN IF NOT EXISTS frequency      text,
  ADD COLUMN IF NOT EXISTS phase_tag      text,
  ADD COLUMN IF NOT EXISTS delivery_note  text;

-- ==============================================================
-- 011_task_dependencies.sql
-- ==============================================================
-- 011: Task dependencies for Gantt / critical-path rendering.
-- Models finish-to-start (and less common variants) relationships between
-- workplan_tasks. Direct writes: CME Admin only. Other roles propose changes
-- via proposed_changes with entity_type = 'task_dependency'.

CREATE TABLE task_dependencies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_task_id   uuid NOT NULL REFERENCES workplan_tasks(id) ON DELETE CASCADE,
  successor_task_id     uuid NOT NULL REFERENCES workplan_tasks(id) ON DELETE CASCADE,
  dependency_type       text NOT NULL DEFAULT 'finish_to_start'
    CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  lag_days              integer NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL REFERENCES users(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES users(id),
  UNIQUE (predecessor_task_id, successor_task_id),
  CHECK (predecessor_task_id <> successor_task_id)
);

CREATE INDEX idx_task_deps_project     ON task_dependencies (project_id);
CREATE INDEX idx_task_deps_predecessor ON task_dependencies (predecessor_task_id);
CREATE INDEX idx_task_deps_successor   ON task_dependencies (successor_task_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_deps_select ON task_dependencies FOR SELECT
  USING (is_cme_staff() OR is_project_member(project_id));

CREATE POLICY task_deps_admin_write ON task_dependencies FOR ALL
  USING (is_cme_admin())
  WITH CHECK (is_cme_admin());

CREATE TRIGGER trg_task_deps_updated_at
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_task_deps_audit
  AFTER INSERT OR UPDATE OR DELETE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ==============================================================
-- 012_submission_snapshot_function.sql
-- ==============================================================
-- 012: Postgres function that captures a workplan_snapshot row of type
-- 'submission' when a new change_submissions row is created. Called from the
-- submit-for-review API endpoint inside the same transaction that inserts
-- the submission and flips the drafts to 'submitted'.

CREATE OR REPLACE FUNCTION capture_submission_snapshot(p_submission_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id   uuid;
  v_submitter_id uuid;
  v_snapshot_id  uuid;
  v_label        text;
  v_workplan     jsonb;
  v_narrative    jsonb;
BEGIN
  SELECT cs.project_id, cs.submitter_id
    INTO v_project_id, v_submitter_id
  FROM change_submissions cs
  WHERE cs.id = p_submission_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'change_submission % not found', p_submission_id;
  END IF;

  SELECT jsonb_build_object(
    'tasks',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(t))
          FROM workplan_tasks t
         WHERE t.project_id = v_project_id
      ), '[]'::jsonb),
    'task_resources',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM workplan_task_resources r
          JOIN workplan_tasks t ON t.id = r.task_id
         WHERE t.project_id = v_project_id
      ), '[]'::jsonb),
    'dependencies',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
          FROM task_dependencies d
         WHERE d.project_id = v_project_id
      ), '[]'::jsonb),
    'deliverables',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(dv))
          FROM deliverables dv
         WHERE dv.project_id = v_project_id
      ), '[]'::jsonb),
    'pending_changes',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(pc))
          FROM proposed_changes pc
         WHERE pc.submission_id = p_submission_id
      ), '[]'::jsonb)
  ) INTO v_workplan;

  SELECT COALESCE(jsonb_agg(to_jsonb(ns)), '[]'::jsonb)
    INTO v_narrative
  FROM narrative_sections ns
  WHERE ns.project_id = v_project_id;

  SELECT 'Submission by ' || COALESCE(u.full_name, u.email) ||
         ' · ' || to_char(now() AT TIME ZONE 'UTC', 'Mon DD, YYYY')
    INTO v_label
  FROM users u
  WHERE u.id = v_submitter_id;

  INSERT INTO workplan_snapshots (
    project_id, snapshot_type, snapshot_label, version_number,
    captured_by, submission_id, data, narrative_data, notes
  ) VALUES (
    v_project_id,
    'submission',
    v_label,
    0,
    v_submitter_id,
    p_submission_id,
    v_workplan,
    v_narrative,
    'Auto-captured on submission'
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- ==============================================================
-- 013_accepted_version_snapshot_function.sql
-- ==============================================================
-- 013: Postgres function that captures a workplan_snapshot row of type
-- 'accepted_version' when a CME Admin accepts one or more proposed_changes
-- in a submission. Called from the submission review API endpoint after
-- accepted changes have been written to the canonical tables.

CREATE OR REPLACE FUNCTION capture_accepted_version_snapshot(
  p_project_id    uuid,
  p_submission_id uuid,
  p_reviewer_id   uuid,
  p_label         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_label       text;
  v_workplan    jsonb;
  v_narrative   jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tasks',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(t))
          FROM workplan_tasks t
         WHERE t.project_id = p_project_id
      ), '[]'::jsonb),
    'task_resources',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM workplan_task_resources r
          JOIN workplan_tasks t ON t.id = r.task_id
         WHERE t.project_id = p_project_id
      ), '[]'::jsonb),
    'dependencies',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
          FROM task_dependencies d
         WHERE d.project_id = p_project_id
      ), '[]'::jsonb),
    'deliverables',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(dv))
          FROM deliverables dv
         WHERE dv.project_id = p_project_id
      ), '[]'::jsonb)
  ) INTO v_workplan;

  SELECT COALESCE(jsonb_agg(to_jsonb(ns)), '[]'::jsonb)
    INTO v_narrative
  FROM narrative_sections ns
  WHERE ns.project_id = p_project_id;

  v_label := COALESCE(
    p_label,
    'Accepted version · ' || to_char(now() AT TIME ZONE 'UTC', 'Mon DD, YYYY')
  );

  INSERT INTO workplan_snapshots (
    project_id, snapshot_type, snapshot_label, version_number,
    captured_by, submission_id, data, narrative_data, notes
  ) VALUES (
    p_project_id,
    'accepted_version',
    v_label,
    0,
    p_reviewer_id,
    p_submission_id,
    v_workplan,
    v_narrative,
    'Auto-captured after submission accept'
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;


-- Manual-snapshot capture function used by the /versions page (CME Admin
-- "Capture manual snapshot" button). Separate function so we can grant
-- differently later if needed; for now it also runs as SECURITY DEFINER but
-- the API route gates it with is_cme_admin().
CREATE OR REPLACE FUNCTION capture_manual_snapshot(
  p_project_id uuid,
  p_label      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_workplan    jsonb;
  v_narrative   jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tasks',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(t))
          FROM workplan_tasks t
         WHERE t.project_id = p_project_id
      ), '[]'::jsonb),
    'task_resources',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM workplan_task_resources r
          JOIN workplan_tasks t ON t.id = r.task_id
         WHERE t.project_id = p_project_id
      ), '[]'::jsonb),
    'dependencies',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
          FROM task_dependencies d
         WHERE d.project_id = p_project_id
      ), '[]'::jsonb),
    'deliverables',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(dv))
          FROM deliverables dv
         WHERE dv.project_id = p_project_id
      ), '[]'::jsonb)
  ) INTO v_workplan;

  SELECT COALESCE(jsonb_agg(to_jsonb(ns)), '[]'::jsonb)
    INTO v_narrative
  FROM narrative_sections ns
  WHERE ns.project_id = p_project_id;

  INSERT INTO workplan_snapshots (
    project_id, snapshot_type, snapshot_label, version_number,
    captured_by, data, narrative_data, notes
  ) VALUES (
    p_project_id,
    'manual',
    p_label,
    0,
    auth.uid(),
    v_workplan,
    v_narrative,
    'Manual snapshot'
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- ==============================================================
-- 014_session6_rls_additions.sql
-- ==============================================================
-- 014: Session 6 RLS additions.
--
-- These policies ADD capabilities only — they never revoke or narrow existing
-- policies. Sessions 1–5 functionality continues to work unchanged. Each
-- addition is justified inline.

-- ---------------------------------------------------------------------------
-- proposed_changes — owners can delete their OWN drafts
-- ---------------------------------------------------------------------------
-- Added so the Drafts tray "Remove" button works for non-admin users.
-- Existing pc_update_own_draft covers UPDATE of own drafts; pc_admin_write
-- already allowed admins anything. This gates DELETE on owner + draft status.
CREATE POLICY pc_delete_own_draft ON proposed_changes FOR DELETE
  USING (proposed_by = auth.uid() AND status = 'draft');

-- ---------------------------------------------------------------------------
-- project_members — any project member can read the member list
-- ---------------------------------------------------------------------------
-- Comments @mention autocomplete needs to list project members. Existing
-- pm_select already covers this (is_cme_staff OR is_project_member), so no
-- change needed.

-- ---------------------------------------------------------------------------
-- workplan_snapshots — allow any project member to insert MANUAL snapshots
-- ---------------------------------------------------------------------------
-- Policy for read was already in place (snapshots_manual_select). The capture
-- function (capture_manual_snapshot) runs SECURITY DEFINER so RLS doesn't
-- gate the insert — but we still restrict who can CALL the function via the
-- API route (is_cme_admin()).

-- ---------------------------------------------------------------------------
-- comments — allow non-author cme_admin to delete (moderation)
-- ---------------------------------------------------------------------------
-- Already covered by comments_delete_own ("author_id = auth.uid() OR is_cme_admin()").

-- ---------------------------------------------------------------------------
-- documents — loosen to allow all project members to read via DAL, but keep
-- writes to CME staff only (unchanged).

-- No policy changes needed beyond the proposed_changes delete above.


-- ---------------------------------------------------------------------------
-- audit_log insert — the trigger runs SECURITY DEFINER and bypasses RLS
-- (no policies needed). We additionally grant INSERT privilege to authenticated
-- for export-specific audit rows logged directly from API routes.
-- ---------------------------------------------------------------------------
CREATE POLICY audit_export_insert ON audit_log FOR INSERT
  WITH CHECK (
    action IN (
      'export.generate',
      'comment.mention',
      'document.upload',
      'document.download',
      'submission.submit',
      'submission.review',
      'snapshot.manual_capture'
    )
    AND actor_id = auth.uid()
  );
