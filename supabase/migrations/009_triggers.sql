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
