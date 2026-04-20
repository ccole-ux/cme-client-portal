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
