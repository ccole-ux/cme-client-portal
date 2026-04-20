# CME Client Portal — Claude Code Session 6 Kickoff

**Target:** Drafts tray, submit/review workflow with field locking, PDF/Excel/CSV exports, threaded comments, document library.
**Expected duration:** 120–150 min on Opus 4.7 Max (heaviest session in the project).
**Prerequisites:**
- Sessions 1–5.1 deployed (costs dashboard with summary tiles working at `/p/a26-0057/costs`)
- `docs/cme_client_portal_spec.md` v1.2 in the repo
- Fresh Claude Code budget (full 5-hour Max reset)
- Resend account created with API key in `.env.local` and Vercel env vars

---

## What you do BEFORE pasting this prompt

1. **Confirm fresh budget window.** Do NOT start if "Approaching usage limit" banner is showing. Wait for the reset.
2. **Sign up for Resend at https://resend.com** if you haven't — free tier handles this session's volume fine.
3. **Add `RESEND_API_KEY` to `.env.local` AND to Vercel env vars** (production). Use `vercel env add RESEND_API_KEY production` and paste the value.
4. **Confirm the @mentions lookup list.** Currently the project only has you (Chris) as a user. Before testing @mentions end-to-end, create a second test user via the admin invite flow so there's someone to mention.

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal, Session 6 of 7. Sessions 1 through 5.1 are deployed. Read `docs/cme_client_portal_spec.md` v1.2 before starting — sections 8, 9, 12 matter most.

## Session 6 goal

This is the session that makes the portal a collaboration tool instead of a dashboard. After this session:
- Users with write permissions see a persistent **Drafts (n)** badge when they have pending proposed changes
- Users can submit drafts as a bundled submission with an optional note
- Submitted drafts lock the affected fields with a visual indicator until the submission is reviewed
- CME Admins review submissions in a queue with accept-all / reject-all / per-change decisions
- Any project member can export workplan state as PDF, Excel, or CSV — scoped by what they can see (clients see their own submissions and all accepted baselines; CME sees everything)
- Exports are CME-branded with letterhead, Oswald/Raleway typography, proper phase/resource breakdowns
- Every project entity supports threaded comments with @mentions and email notifications via Resend
- CME Admins can upload and version documents in a per-project library
- Everything is logged in audit_log
- Deployed to Vercel

This is the final workflow session before the AI assistant in Session 7.

## Tasks in order

### 1. Install dependencies
```bash
npm install @react-pdf/renderer@^3 exceljs
npx shadcn@latest add drawer toast textarea checkbox
```

Note: `@react-pdf/renderer` needs server-side rendering. Use `export const runtime = 'nodejs'` on any route handler that uses it. Do not import it client-side.

### 2. Drafts tray page + API

Create `src/app/(app)/p/[slug]/drafts/page.tsx`:
- Server component loads all `proposed_changes` where `proposed_by = current_user_id AND status = 'draft' AND project_id = <this project>`
- Renders a table grouped by entity type (workplan task edits, new tasks, task dependency changes)
- Each row: entity reference (task name or WBS), operation, change summary (old → new), created_at, per-row [Remove] button
- Bottom of page: Textarea for submission note (optional, max 500 chars) + "Submit all for review" button + count badge
- Empty state when no drafts exist

Create `src/app/api/drafts/[id]/route.ts` — DELETE endpoint for removing individual drafts. RLS restricts to the proposer.

Add a persistent "Drafts (N)" badge to the app sidebar nav. Badge appears only for users with write permissions AND has pending drafts. Click → navigates to drafts page.

### 3. Submit-for-review endpoint

Create Postgres function `capture_submission_snapshot(p_submission_id uuid)`:
```sql
CREATE OR REPLACE FUNCTION capture_submission_snapshot(p_submission_id uuid)
RETURNS uuid AS $$
DECLARE
  v_project_id uuid;
  v_snapshot_id uuid;
  v_workplan_data jsonb;
  v_narrative_data jsonb;
BEGIN
  SELECT project_id INTO v_project_id FROM change_submissions WHERE id = p_submission_id;
  
  -- Snapshot the current state of workplan + proposed_changes in this submission
  SELECT jsonb_build_object(
    'tasks', (SELECT jsonb_agg(to_jsonb(t)) FROM workplan_tasks t WHERE t.project_id = v_project_id),
    'task_resources', (SELECT jsonb_agg(to_jsonb(r)) FROM workplan_task_resources r 
                       JOIN workplan_tasks t ON t.id = r.task_id 
                       WHERE t.project_id = v_project_id),
    'dependencies', (SELECT jsonb_agg(to_jsonb(d)) FROM task_dependencies d WHERE d.project_id = v_project_id),
    'deliverables', (SELECT jsonb_agg(to_jsonb(dv)) FROM deliverables dv WHERE dv.project_id = v_project_id),
    'pending_changes', (SELECT jsonb_agg(to_jsonb(pc)) FROM proposed_changes pc WHERE pc.submission_id = p_submission_id)
  ) INTO v_workplan_data;

  SELECT jsonb_agg(to_jsonb(ns)) INTO v_narrative_data 
    FROM narrative_sections ns WHERE ns.project_id = v_project_id;

  INSERT INTO workplan_snapshots (
    project_id, snapshot_type, snapshot_label, version_number,
    captured_by, submission_id, data, narrative_data, notes
  )
  SELECT
    v_project_id,
    'submission',
    'Submission by ' || u.full_name || ' — ' || to_char(now(), 'Mon DD, YYYY'),
    1, -- trigger auto-increments
    cs.submitter_id,
    p_submission_id,
    v_workplan_data,
    v_narrative_data,
    'Auto-captured on submission'
  FROM change_submissions cs
  JOIN users u ON u.id = cs.submitter_id
  WHERE cs.id = p_submission_id
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Add migration `012_submission_snapshot_function.sql` with the above.

Create `src/app/api/submissions/route.ts` — POST endpoint:
1. Verify caller has write role via RLS
2. Find all caller's draft proposed_changes in target project (at least 1 required)
3. In a transaction: insert `change_submissions` row, update all drafts to status='submitted' + submission_id, call `capture_submission_snapshot`
4. Send email to all CME Admins via Resend (subject: "New submission for review on A26-0057")
5. Return submission id

### 4. Field locking on submitted drafts

Create `src/lib/drafts/field-state.ts`:
```ts
export type FieldSubmissionState = {
  isLocked: boolean;
  submissionId: string | null;
  submittedByUser: string | null;
  submittedAt: string | null;
};

export async function getFieldSubmissionState(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
  fieldName: string
): Promise<FieldSubmissionState>;
```

Looks up `proposed_changes` where entity matches, status='submitted', and change_data includes the field. Returns lock state.

Wire into:
- Task detail drawer — check each field before allowing edit
- Gantt drag handlers — check start_date/finish_date before allowing drag
- Any editable field in the tasks list

Visual treatment: small yellow lock icon next to locked field, tooltip "Pending review — submitted by [user] on [date]". CME Admin can still edit but gets a confirm modal first.

### 5. Review queue for CME Admin

Create `src/app/(app)/p/[slug]/review/page.tsx` (CME Admin only):
- Lists all submissions with status='pending_review' for this project
- Card per submission: submitter, submitted_at, note, change count, [Review] button
- Click Review → detail view with each proposed_change shown with before/after
- Per-row Accept / Reject / Skip buttons
- Bulk actions at top: Accept all / Reject all (required reason textarea for reject)

Create `src/app/api/submissions/[id]/review/route.ts` — POST handler:
1. Verify caller is_cme_admin()
2. For each change decision (accept/reject), update proposed_changes.status + applied_at
3. For accepted changes, apply change_data.new to canonical entity
4. If ANY change was accepted, call Postgres function `capture_accepted_version_snapshot(project_id)` — similar to submission snapshot but type='accepted_version'
5. Update change_submissions.status to accepted/rejected/mixed based on outcomes
6. Send email to submitter with results

Add the `capture_accepted_version_snapshot` function as migration `013`.

### 6. Submissions list page

Create `src/app/(app)/p/[slug]/submissions/page.tsx`:
- ACTC users see only their own submissions
- CME staff see all submissions
- Per row: submitter, submitted_at, note excerpt, change count, status badge, reviewer (if reviewed), per-row Download button (PDF/Excel/CSV dropdown)
- Click row → expand to show individual changes and their individual outcomes

### 7. PDF export

Create `src/lib/export/pdf.tsx` using `@react-pdf/renderer`. CME-branded layout:

**Cover page:**
- CME letterhead top: overlapping dark-green (#25532E) + bright-green (#3C9D48) triangles
- "CME CLIENT PORTAL" in Oswald at top center
- Project name "A26-0057" large in Oswald, dark-green
- "Alameda County Transportation Commission" subtitle in Raleway
- Version label: "Submission #N by [user] · Apr 20, 2026" or "Canonical Baseline · Generated [date]"
- Generation timestamp
- CME logo placeholder or mark at bottom

**Workplan table page(s):**
- Grouped by phase with phase header bars in dark-green
- Columns: WBS | Task | Start | Finish | Resource | Hours | Rate Year | Rate | Cost | Status
- Page breaks repeat phase + table headers
- Milestones with diamond marker

**Milestones page:** simple table

**Cost summary page:** three mini-tables (By Firm, By Phase, By Month) + baseline vs forecast tiles

**Version metadata page:** who captured, when, diff summary if submission scope

**Footer every page:** project name | version | page N of M

**Font registration:**
```ts
Font.register({
  family: 'Raleway',
  src: 'https://fonts.googleapis.com/...',  // fetch actual URL from Google Fonts
});
Font.register({
  family: 'Oswald',
  src: 'https://fonts.googleapis.com/...',
});
```

Note: `@react-pdf/renderer` requires absolute font URLs or font buffers. Test font loading in Vercel serverless environment — may need to inline font data or use a CDN.

### 8. Excel export

Create `src/lib/export/excel.ts` using `exceljs`. Multi-sheet workbook:
- **Summary** — project metadata, totals, version info
- **Workplan** — full task list, Status column matches v8 structure, formulas preserved
- **Milestones** — rows with ★ marker
- **Resources** — name, firm, role, current rate
- **Rate History** — full date-effective rate table (audit trail)
- **Cost Analysis** — pivots by firm/user/phase/month

Styling:
- Header rows: dark-green fill (#25532E), white Oswald text
- Milestone rows: yellow (#FFCB0E) fill with ★
- Status column: conditional formatting matching badge colors
- Column auto-sizing

### 9. CSV export

Create `src/lib/export/csv.ts`. Flat file, one row per task-resource assignment:
```
wbs,task_name,phase,start_date,finish_date,resource_name,firm,rate_year,rate,hours,cost,status,notes
```

Proper escaping (commas, quotes, newlines in cell values).

### 10. Export API endpoints

Create `src/app/api/export/workplan/[...scope]/route.ts` handling all 5 scopes:
```
GET /api/export/workplan/draft?format=pdf|xlsx|csv
GET /api/export/workplan/canonical?format=pdf|xlsx|csv
GET /api/export/workplan/submission/[id]?format=pdf|xlsx|csv
GET /api/export/workplan/version/[id]?format=pdf|xlsx|csv
GET /api/export/narrative?format=pdf
```

Each handler:
1. **Enforce visibility per spec section 12:**
   - `draft` — caller must be draft owner
   - `canonical` — caller must be project member
   - `submission` — caller must be submitter OR is_cme_staff()
   - `version` — caller must be project member
   - `narrative current` — project member; narrative historical — CME only
2. Load appropriate data (from canonical tables for draft/canonical; from `workplan_snapshots.data` for submission/version)
3. Generate file in requested format
4. Log `audit_log` entry with action='export.generate', payload={scope, format, requester}
5. Return with `Content-Type` and `Content-Disposition: attachment; filename="A26-0057-[scope]-[date].[ext]"`

Set `export const runtime = 'nodejs'` on every export route.

### 11. Download UX

Every screen with workplan data gets a Download button (top-right). Use shadcn DropdownMenu:

- "Download my draft" → format picker (PDF/Excel/CSV) — disabled if no drafts
- "Download canonical" → format picker
- "Download submission…" → submenu of visible submissions, each with format picker
- "Download version…" → submenu of accepted versions, each with format picker

On Submissions and Versions pages, add per-row Download buttons.

### 12. Versions page

Create `src/app/(app)/p/[slug]/versions/page.tsx`:
- Lists `workplan_snapshots` with snapshot_type IN ('accepted_version', 'manual')
- Per row: version number, label, captured_at, captured_by, [Download PDF/Excel/CSV]
- CME Admin can "Capture manual snapshot" with label input

### 13. Threaded comments

Create `src/components/comments/CommentThread.tsx`:
- Props: `entityType`, `entityId`
- Renders existing comments (max nesting depth 3)
- Each comment: author avatar, timestamp (relative: "3 hours ago"), markdown body, reply button, resolve button (top-level only)
- Input: textarea with @mention popover (type @ triggers user picker listing project members)
- "Show resolved (n)" toggle

Create `src/app/api/comments/route.ts` for POST/PATCH/DELETE. On @mention:
1. Insert rows into `notifications` for each mentioned user
2. Send email via Resend with link to entity

Wire CommentThread into:
- Task detail drawer (entityType='workplan_task')
- Narrative sections on Overview page (entityType='narrative_section')
- Submissions detail (entityType='change_submission')

### 14. Document library

Create `src/app/(app)/p/[slug]/documents/page.tsx`:
- Category sections: Contracts & Agreements, Workplans, Reports, Specifications, Other
- Upload button (CME staff only): drag-drop zone + file picker
- Each document card: title, description, size, version, uploaded_by, [Download]
- Version history: new upload with same title creates v2, v3, etc.; old versions accessible via "Version history" link

Storage: Supabase Storage bucket `documents`. RLS:
- Read: project members only
- Write: CME staff (cme_admin + cme_viewer)

API: `src/app/api/documents/route.ts` with multipart upload. Signed URLs for downloads.

### 15. Activity feed

Update `/p/[slug]/activity` — unified chronological feed:
- Submissions (submitted, reviewed)
- Comments
- Document uploads
- Rate changes
- Manual snapshots

50 events per page with pagination.

### 16. Notifications inbox

Add bell icon in app header with unread count badge.
Dropdown on click: recent notifications, each linking to relevant entity.
- @mentions in comments
- Submissions needing your review (CME Admin only)
- Your submission reviewed (submitter)
- Documents added

"Mark all read" button. Use existing `notifications` table.

### 17. Run lint, build, test
```bash
npm run lint
npm run build
npx vitest run
```

### 18. Commit + push + deploy
```bash
git add .
git commit -m "Session 6: Drafts, submissions, review, exports, comments, documents"
git push
```

### 19. Smoke test on production

Walk through end-to-end on `cme-client-portal.vercel.app`:

1. Log in as Chris (CME Admin)
2. Invite a second user (CME Viewer role) via admin
3. Log in as that second user via magic link
4. As Viewer: on Gantt, drag a task bar → draft created (yellow bar)
5. Navigate to /drafts → confirm 1 draft listed
6. Add note, click Submit → receive toast "Submitted for review"
7. Check Chris's email inbox → submission notification received via Resend
8. Log in as Chris → notification bell shows new submission
9. Navigate to /review → see pending submission
10. Click Review → see the change preview → Accept
11. Check Viewer's inbox → outcome email received
12. Navigate to /versions → see baseline + new accepted_version
13. Download canonical PDF → verify CME branding renders, all pages present
14. Download canonical Excel → open, verify 6 sheets
15. Download canonical CSV → open, verify flat structure
16. Post a comment on a task, @-mention the Viewer → they receive email
17. Upload a document as Chris → Viewer sees it in library
18. Check audit log for all export.generate actions
19. Mobile: open /drafts on phone → readable layout

### 20. Report back with:
- Live Vercel URL
- Screenshots of: Drafts tray, Review queue, Submissions list, Versions list, Documents page, sample PDF export (open in viewer), sample Excel export (open in spreadsheet app), comment thread with @mention
- Confirmation that all 19 smoke test steps pass
- Any edge cases or UX polish needed
- Resend email screenshots (submission notification + review outcome) confirming they look CME-branded

## Out of scope for Session 6
- AI assistant (Session 7)
- Rich text editor (markdown is enough)
- Version diff visualizer (defer)
- Bulk document upload (single-file is fine)
- Notification preferences (user-level preferences are future work)

## Pause and ask if
- `@react-pdf/renderer` fails in Vercel serverless environment — test early with a minimal PDF before building full layout. Alternatives: pre-render server-side and cache, or use puppeteer (heavier but more reliable)
- Field locking breaks existing Gantt drag-to-edit flow
- Resend quotas hit (shouldn't on free tier for this volume)
- Storage upload fails (may need to increase Supabase Storage file size limit — default 5MB; workplans can be larger)

## Design constraints
- CME colors only: dark-green primary, bright-green success, yellow accent, red destructive
- Oswald headings, Raleway body everywhere (including PDFs)
- Every action logged to audit_log
- Every email sent via Resend with CME-branded HTML template (green header, logo, clean styling)
- All exports reference "A26-0057" not "PCS SaaS Replacement"
