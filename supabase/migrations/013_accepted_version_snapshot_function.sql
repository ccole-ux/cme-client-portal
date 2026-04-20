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
