# CME Client Portal — Autonomous Run: Session 6b + Session 7 + Polish

**Target:** Fix the Gantt rendering bug, add CME Reviewer role, build the AI assistant (Session 7), apply polish, and deploy everything. Autonomous — Chris is traveling.
**Expected duration:** 60–90 min on Opus 4.7 Max.
**Prerequisites met:**
- Session 6 deployed at `cme-client-portal.vercel.app`
- Documents bucket created in Supabase
- `RESEND_API_KEY` in Vercel production (note: key will be rotated by Chris from mobile; don't touch the env var)
- All migrations through 014 applied
- Vercel CLI linked to `ccole-uxs-projects/cme-client-portal`

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal. Chris is traveling and needs this to run autonomously for ~60 minutes. Do the work in order, commit frequently, push to main (Vercel auto-deploys), and produce a concise end-of-run report. Don't pause for clarifying questions unless something genuinely blocks progress — make reasonable judgment calls and document them in the report.

Read `docs/cme_client_portal_spec.md` v1.2 if you need context. Read `docs/cme_portal_claude_code_session6.md` for the Session 6 context.

## Priority 1 — FIX THE GANTT BUG (15 min)

Chris reported: "I don't see any task bars to move. I don't see anywhere to create a draft."

From his screenshot `/p/a26-0057/gantt`: the left-side task table renders correctly with 29 task rows visible. The right side shows an empty timeline with 2026 month labels but no bars. The viewport is showing April 2026 (before project start May 1, 2026), which explains why Chris sees no bars even though the task table is correct.

**Root cause hypotheses (check in this order):**

1. **Viewport default isn't landing on project start.** The view shows April 2026 but the project starts May 1, 2026. Default viewport should auto-center on the project timeline OR start at project start date, not "today minus some offset."
2. **Right-pane width collapsed.** If the right-pane is zero-width at narrow viewports, bars won't render but the task table is visible via CSS grid. Check computed styles.
3. **Task bars rendering off-screen horizontally.** If the pixel math for bar position = startDate - earliestProjectDate assumes the viewport starts at earliestProjectDate, but viewport was changed to "today," bars get positioned at negative x-coordinates and clipped.

**Fix these:**

1. Set default viewport scroll position so May 1, 2026 is visible on first load. When URL has no `?view=` param, default to `?view=Month` and scroll to `scrollLeft = (projectStartDate - viewportStartDate) * dayWidthPx`.
2. Add a "Jump to project start" button in the Gantt header next to the zoom buttons.
3. Add a "Fit to project" button that zooms to show the entire project span (~365 days) in the viewport width.
4. Verify bar rendering uses absolute pixel positioning within the right-pane's scroll container, and that the container has `overflow-x: auto`.
5. Verify the task detail drawer opens when clicking any task in the left table. This is the "create a draft" entry point for CME Viewer users.
6. Add a visible "Drafts (0)" link to the Gantt page top-right so users know drafts exist as a concept even before they create one.

After the fix, take a Puppeteer or curl-based screenshot of the rendered Gantt to verify bars appear — if headless screenshot is too complex, just verify via computed HTML that SVG bar elements exist within the scroll viewport's visible range.

## Priority 2 — ADD CME REVIEWER ROLE (20 min)

Chris wants to add "CME Reviewer" as a new role alongside cme_admin and cme_viewer. Purpose: a CME team member who can review submissions from ACTC reviewers without being a full admin (no user management, no direct edits to canonical data, but can accept/reject submissions).

### 2.1 — Schema migration

Create `supabase/migrations/015_cme_reviewer_role.sql`:

```sql
-- Add cme_reviewer to the role enum
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('cme_admin', 'cme_reviewer', 'cme_viewer', 'actc_reviewer', 'actc_viewer'));

-- Helper function: is_cme_staff already exists and covers admin + viewer.
-- Add cme_reviewer to is_cme_staff definition.
CREATE OR REPLACE FUNCTION is_cme_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role IN ('cme_admin', 'cme_reviewer', 'cme_viewer')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- New helper: can_review_submissions
CREATE OR REPLACE FUNCTION can_review_submissions()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role IN ('cme_admin', 'cme_reviewer')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Update submission review RLS to use the new helper
DROP POLICY IF EXISTS submissions_review_update ON change_submissions;
CREATE POLICY submissions_review_update ON change_submissions FOR UPDATE
  USING (can_review_submissions());
```

Apply the migration to the remote DB.

### 2.2 — UI updates

- Add `cme_reviewer` to the Invite User role dropdown in admin with label "CME Reviewer" and description "Can review submissions from ACTC and accept/reject changes. Cannot manage users or directly edit the workplan."
- Update the role badge styling to differentiate cme_reviewer (use a teal/blue badge to distinguish from cme_admin green and cme_viewer gray).
- In the Review queue, ensure cme_reviewer users can see pending submissions and accept/reject them.
- In user lists and profile displays, render the new role appropriately.
- In the spec doc (`docs/cme_client_portal_spec.md`), add the new role to the permissions matrix in section 3. Don't rewrite the whole spec — just add the role row.

### 2.3 — Test with Vitest

Add a test: `cme_reviewer can call capabilities needed for review actions` — verify the helper returns true, and that they can't call admin-only operations (like user invite).

## Priority 3 — SESSION 7: AI ASSISTANT (30-40 min)

### 3.1 — Dependencies

```bash
npm install @anthropic-ai/sdk
```

### 3.2 — Environment variable

Chris needs to add `ANTHROPIC_API_KEY` to production. **Don't touch this yourself.** Add a note to the end-of-run report: "Chris needs to run `vercel env add ANTHROPIC_API_KEY production` and paste his Anthropic console key."

For now, write code that reads `process.env.ANTHROPIC_API_KEY` and gracefully fails if missing — render a "AI Assistant requires configuration" banner instead of crashing.

### 3.3 — Data model

Already in place from Session 2: `ai_conversations` (project-scoped conversation threads) and `ai_messages` (individual messages).

### 3.4 — Tool definitions

Create `src/lib/ai/tools.ts` defining the tools Claude can call. All tools are PROPOSE-ONLY — they create drafts, never directly mutate canonical data.

```ts
export const AI_TOOLS = [
  {
    name: 'query_workplan',
    description: 'Search and filter the workplan tasks. Returns WBS, name, phase, dates, resources, hours, cost, status.',
    input_schema: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'Filter by phase (e.g., "1", "1.5", "2", "3", "PM")' },
        status: { type: 'string', enum: ['not_started', 'in_development', 'submitted_for_review', 'accepted', 'rejected', 'deferred'] },
        search: { type: 'string', description: 'Free text search on task name or WBS' },
        include_milestones: { type: 'boolean' },
      },
    },
  },
  {
    name: 'query_costs',
    description: 'Get cost aggregations by firm, resource, phase, or month.',
    input_schema: {
      type: 'object',
      properties: {
        dimension: { type: 'string', enum: ['firm', 'resource', 'phase', 'month'] },
        metric: { type: 'string', enum: ['hours', 'cost'] },
      },
      required: ['dimension', 'metric'],
    },
  },
  {
    name: 'query_deliverables',
    description: 'List contract deliverables with owner, frequency, delivery note, WBS links.',
    input_schema: {
      type: 'object',
      properties: {
        task_number: { type: 'string', description: 'Filter by parent task (1, 2, 3, or O1)' },
        owner: { type: 'string', description: 'Filter by owner initials (e.g., "CC/MN")' },
      },
    },
  },
  {
    name: 'search_narrative',
    description: 'Search the project narrative sections for content relevant to a question.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_rate_history',
    description: 'Get rate history for resources. Use to explain cost escalation or compare rates.',
    input_schema: {
      type: 'object',
      properties: {
        resource_id: { type: 'string' },
        year: { type: 'integer' },
      },
    },
  },
  {
    name: 'propose_task_update',
    description: 'Create a DRAFT proposal to update fields on an existing task. Will not be applied until user submits. Requires caller to have write permissions.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', format: 'uuid' },
        field_updates: { type: 'object', description: 'Fields to update: start_date, finish_date, hours, status, notes' },
        reason: { type: 'string', description: 'Why this change is proposed — shown in the draft and on review' },
      },
      required: ['task_id', 'field_updates', 'reason'],
    },
  },
  {
    name: 'propose_new_task',
    description: 'Create a DRAFT proposal to add a new task. Will not be applied until user submits.',
    input_schema: {
      type: 'object',
      properties: {
        task_name: { type: 'string' },
        wbs: { type: 'string' },
        phase: { type: 'string' },
        start_date: { type: 'string', format: 'date' },
        finish_date: { type: 'string', format: 'date' },
        hours: { type: 'number' },
        resource_assignments: { type: 'array' },
        reason: { type: 'string' },
      },
      required: ['task_name', 'wbs', 'phase', 'start_date', 'finish_date', 'reason'],
    },
  },
  {
    name: 'propose_delete_task',
    description: 'Create a DRAFT proposal to remove a task. Will not be applied until user submits.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', format: 'uuid' },
        reason: { type: 'string' },
      },
      required: ['task_id', 'reason'],
    },
  },
  {
    name: 'propose_milestone',
    description: 'Create a DRAFT proposal to add or update a milestone.',
    input_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'update'] },
        milestone_ref: { type: 'string', description: 'e.g., M3.5' },
        target_date: { type: 'string', format: 'date' },
        name: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['operation', 'reason'],
    },
  },
];
```

### 3.5 — Tool implementation

Create `src/lib/ai/tool-handlers.ts`. For each tool:
- Query-type tools: call Supabase directly using the caller's RLS-scoped client (not service role). Return structured JSON.
- Propose-type tools: insert into `proposed_changes` with `status='draft'`, `proposed_by=<current user>`, `via_ai=true` flag, the specified change_data and reason. Return the draft ID and a note "Draft created. Visit /p/a26-0057/drafts to review and submit."

Add a `via_ai` boolean column to `proposed_changes` in migration `016_proposed_changes_via_ai.sql`:

```sql
ALTER TABLE proposed_changes ADD COLUMN via_ai BOOLEAN NOT NULL DEFAULT false;
```

### 3.6 — Chat API route

Create `src/app/api/ai/chat/route.ts`:
- POST endpoint accepting `{ conversation_id, user_message }`
- Loads conversation history from `ai_messages`
- Constructs Anthropic API call with: system prompt, conversation history, AI_TOOLS, user's new message
- Uses model `claude-sonnet-4-5` (or `claude-opus-4-5` if the user has Pro tier — start with Sonnet to manage costs)
- Runs tool-use loop: receive tool_use block → execute tool handler → send tool_result back → get next assistant message
- Saves all messages (user, assistant, tool_use, tool_result) to `ai_messages`
- Returns the final assistant response as streaming SSE

System prompt:
```
You are the CME Project Assistant helping a team manage the A26-0057 project — a $1.36M SaaS replacement for Alameda CTC's Project Controls System. Your role is to answer questions about the workplan, schedule, costs, resources, and deliverables, and to help users propose changes.

CRITICAL RULES:
- You cannot directly edit the workplan. The propose_* tools create DRAFTS that the user must explicitly submit for review.
- When a user asks to make a change, always clarify what they want, then call the appropriate propose_* tool, then tell them: "I've created a draft. Review it at /p/a26-0057/drafts and click Submit when ready."
- Always cite specific data you retrieved (WBS numbers, task names, dollar amounts) rather than speaking in generalities.
- If you don't have data on something, say so — don't make up numbers.
- Current date context: The portal is live as of April 20, 2026. Project kickoff is May 1, 2026.
- Escalation policy: All 2027 work uses 3% escalated rates from the B7 R26-003 baseline. Current forecast with escalation: $1,363,308. Signed baseline: $1,356,256.

Be concise and professional. Stakeholders include ACTC staff and CME team members.
```

### 3.7 — Sidebar chat UI

Create `src/components/ai/AssistantSidebar.tsx`:
- Collapsible sidebar on the right side of every project page
- Collapsed state: 40px wide, just shows the AI icon
- Expanded state: 400px wide, shows:
  - Conversation list (top, compact — clicking loads that thread)
  - Current message thread (middle, scrolls)
  - Input textarea + Send button (bottom)
  - "New conversation" button
- Messages render markdown; tool calls render as collapsed "Called query_workplan" chips that expand on click
- When assistant proposes a change, show a green inline card: "✓ Draft created — [Review in Drafts →]"

"Open in new window" button that pops out the conversation into a separate browser window at `/p/a26-0057/assistant/[conversation_id]`.

### 3.8 — Permissions

- ACTC Reviewer and CME Viewer+ can use query-type tools
- ACTC Reviewer and CME Viewer+ can use propose-type tools (drafts are scoped to their own proposed_changes rows by RLS)
- ACTC Viewer can only use query-type tools
- The API route enforces this at the tool-dispatch level by checking the caller's role before executing

## Priority 4 — POLISH (10 min, do this last with any remaining time)

1. **The Drafts(N) badge** — surface it in the sidebar nav as discussed. Live count of current user's drafts.
2. **Fix overview counter** — says "90 tasks + 9 milestones across 1 status" but should say "...across 1 status" where 1 is pluralized correctly; also consider "99 items across 1 status" for a cleaner read.
3. **Today line on burn chart** — fix overlap with May 2026 data point when today is before project start (today is Apr 20).
4. **By Month chart** — the blue/purple colors for Jan/Feb/Mar 2027 look disconnected. Apply consistent Phase coloring OR make all 12 months the same CME bright-green for consistency.
5. **.gitignore check** — verify `.env.local`, `.vercel/`, `node_modules/` are all ignored.

## Priority 5 — SMOKE TEST (as much as can be done autonomously)

You can't click through two browser windows, but you CAN:

- Run Vitest and confirm all tests pass (33+ tests)
- Hit production endpoints with authenticated fetch from a server-side script to verify:
  - `GET /api/workplan-tasks` returns 99 rows
  - `GET /api/submissions?project_id=...` works
  - `POST /api/drafts` creates a draft (use your own service role key for this if needed, then clean up)
  - `GET /api/export/workplan/canonical?format=csv` returns valid CSV
  - The AI chat endpoint responds to a test message

Run these as integration tests in `__tests__/smoke/session-6-7.test.ts` and include the output in your end-of-run report.

## Priority 6 — COMMIT + DEPLOY

After every priority above, commit with a clear message:
- "Fix Gantt viewport and add Drafts entry point"
- "Add CME Reviewer role with submission review permission"
- "Session 7: AI assistant with propose-only tools"
- "Polish: Drafts badge, counter grammar, burn chart today line, month colors"

Push to main after each major chunk so Vercel can auto-deploy progressively. Chris sees incremental progress if he checks during his train ride.

## END-OF-RUN REPORT

Produce a concise markdown report at `docs/session-run-report-2026-04-20.md` covering:

- What shipped (grouped by priority)
- What was tested and results (Vitest counts, smoke test outcomes)
- What Chris needs to do when back:
  - Rotate Resend key and update RESEND_API_KEY in Vercel
  - Add ANTHROPIC_API_KEY to Vercel production
  - Manual end-to-end smoke test (the 8-step sequence for session 6 + a few AI assistant prompts)
- Known issues or judgment calls you made
- Remaining tech debt or follow-ups

Commit this report to the repo.

## DON'T
- Don't rotate the Resend key or touch env vars — Chris is doing that from his phone
- Don't modify the Supabase service_role key
- Don't merge to any branch other than main
- Don't attempt the 19-step Session 6 smoke test — can't automate it
- Don't skip Vitest — tests catch regressions

## JUDGMENT CALLS
When blocked and Chris isn't available to ask:
- Prefer the simpler/safer implementation over the fancier one
- If a library behaves unexpectedly, swap for a proven alternative rather than debug for more than 10 minutes
- If a test fails and the fix is obvious, fix it; if it's not obvious, mark it xfail with a comment and document in the report
- Never disable RLS to "work around" a policy issue — always fix the policy

Chris has budget for this session on Opus 4.7 Max. Work steadily, commit often, don't rush but don't dawdle.
