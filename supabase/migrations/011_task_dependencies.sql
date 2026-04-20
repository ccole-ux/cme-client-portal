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
