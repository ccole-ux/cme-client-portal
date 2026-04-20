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
