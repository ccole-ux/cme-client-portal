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
