# CME Client Portal — Claude Code Session 4 Kickoff

**Target:** Editable Gantt chart with drag-to-edit, task dependencies, critical path highlighting, click-to-drawer detail panel, and mobile fallback.
**Expected duration:** 75–90 min on Opus 4.7 Max.
**Prerequisites:**
- Session 3 deployed (seed + rate engine + list views working at `/p/a26-0057`)
- `docs/cme_client_portal_spec.md` v1.2 in the repo
- Fresh Claude Code budget window (this is the heaviest session)

---

## What you do BEFORE pasting this prompt

- **Verify Session 3 works.** Log in at `cme-client-portal.vercel.app`, navigate to `/p/a26-0057`, confirm all four existing tabs (Overview, Tasks, Resources, Milestones) render real data. If anything's broken, fix it before starting Session 4.
- **Confirm fresh token budget.** This is a heavy session — Gantt library evaluation, drag-and-drop state, dependency logic, critical path calculation, mobile fallback. Don't start if Claude Code was "Approaching usage limit" — wait for the 5-hour window reset on Max.
- **Nothing else external.** No new services, no new credentials.

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal, Session 4 of 7. Sessions 1–3 are deployed. The project has been renamed to A26-0057 (slug `a26-0057`). Read `docs/cme_client_portal_spec.md` before starting. Sections 8, 11, and 6 matter most.

## Session 4 goal

Add a working, interactive Gantt chart to the portal with task dependencies and critical path highlighting. After this session:
- `/p/a26-0057/gantt` renders all 90 tasks + 9 milestones on a horizontal timeline
- Tasks can be dragged to change dates — CME Admin commits immediately; viewers/clients create drafts
- Clicking a task opens a detail drawer with full metadata including cost breakdown by rate period
- Task dependencies (finish-to-start, standard) can be created/edited via the drawer
- Critical path is computed server-side and rendered in red on the Gantt
- Phase swim lanes group tasks visually (Phase 1, 1.5, 2, 3, PM)
- Today-line in CME yellow
- Milestone diamonds
- Mobile fallback: vertical timeline list, no drag editing, tap-to-drawer

## Tasks in order

### 1. Pick a Gantt library — commit to ONE
Research and pick between `frappe-gantt`, `dhtmlx-gantt Standard`, and a custom React SVG implementation. Criteria in priority order:
1. Supports drag-to-move AND drag-to-resize of tasks
2. Supports finish-to-start dependencies rendered as arrows
3. Can overlay a "critical path" visual treatment (color or stroke weight)
4. Responsive / reasonable behavior at narrow viewports (even if we're replacing it on mobile)
5. TypeScript friendly (types available or easy to wrap)
6. MIT or similar permissive license
7. Reasonable bundle size (under 200KB gzipped)

Write your evaluation in a comment at the top of `src/components/gantt/GanttChart.tsx` explaining the choice and trade-offs. **Pick one and commit.** Don't keep options open.

### 2. New migration for task_dependencies
Create `supabase/migrations/011_task_dependencies.sql`:

```sql
CREATE TABLE task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_task_id uuid NOT NULL REFERENCES workplan_tasks(id) ON DELETE CASCADE,
  successor_task_id uuid NOT NULL REFERENCES workplan_tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_to_start' 
    CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  lag_days integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  UNIQUE (predecessor_task_id, successor_task_id),
  CHECK (predecessor_task_id <> successor_task_id)
);

CREATE INDEX idx_task_deps_project ON task_dependencies(project_id);
CREATE INDEX idx_task_deps_predecessor ON task_dependencies(predecessor_task_id);
CREATE INDEX idx_task_deps_successor ON task_dependencies(successor_task_id);

-- RLS: read per-project, write only CME Admin (direct) or via proposed_changes (clients propose)
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_deps_select ON task_dependencies FOR SELECT
  USING (is_cme_staff() OR is_project_member(project_id));

CREATE POLICY task_deps_insert ON task_dependencies FOR INSERT
  WITH CHECK (is_cme_admin());

CREATE POLICY task_deps_update ON task_dependencies FOR UPDATE
  USING (is_cme_admin());

CREATE POLICY task_deps_delete ON task_dependencies FOR DELETE
  USING (is_cme_admin());

-- Apply the standard updated_at + audit triggers
CREATE TRIGGER task_deps_set_updated_at BEFORE UPDATE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER task_deps_audit AFTER INSERT OR UPDATE OR DELETE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
```

Also extend `proposed_changes.entity_type` so clients can propose dependency changes — no schema change needed, just document that `task_dependency` is a valid entity_type value.

Run the migration against Supabase. Regenerate types: `npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/supabase/types.ts`.

### 3. Seed initial dependencies
Create `scripts/seed-dependencies.ts` to insert baseline dependencies based on the workplan structure. Infer from spec section 6 and the `ACTC_PCS_Workplan_v8.xlsx` Key Dependencies block. At minimum, seed these:

- 1.0.3 (Findings package) → 1.1.1 (Schema design)
- 1.0.3 → 1.11.1 (Cleanup plan)
- 1.1.1 → 1.2.1 (Programming data model)
- 1.1.1 → 1.3.1 (Projects data model)
- 1.1.1 → 1.4.1 (Contracts data model)
- 1.1.1 → 1.5.5 (Invoice data model)
- 1.1.1 → 1.6.1 (Funding data model)
- 1.11.5 (Cleanup signoff) → M3.5 milestone → 1.7.2 (Dry Run 2)
- 1.7.2 → M4 → 1.9.3 (Dashboard finalization)
- 1.9.3 → 1.9.4 (Susan's Reporting Template)
- 1.10.2 (Bug fixes) → M5 (Phase 1 MVP Go-Live)
- M5 → 1.5A.1 (AI Data Access)
- 1.5A.3 → M6
- M7 → 3.1 (AccuFund bidirectional sync)
- 3.5 (Cutover prep) → M8

All milestones already exist as `workplan_tasks` rows with `is_milestone=true`. Use them as nodes in the dependency graph just like tasks.

Run the seed: `npx tsx scripts/seed-dependencies.ts`. Expect ~15 dependency rows inserted.

### 4. Critical path computation
Create `src/lib/schedule/critical-path.ts` with pure functions:

```ts
export type TaskNode = {
  id: string;
  start_date: Date;
  finish_date: Date;
  duration_days: number;
  is_milestone: boolean;
};

export type DependencyEdge = {
  predecessor_id: string;
  successor_id: string;
  lag_days: number;
};

export type ScheduleAnalysis = {
  task_id: string;
  early_start: Date;
  early_finish: Date;
  late_start: Date;
  late_finish: Date;
  total_float_days: number;
  is_on_critical_path: boolean;
};

export function computeCriticalPath(
  tasks: TaskNode[],
  dependencies: DependencyEdge[]
): Map<string, ScheduleAnalysis> {
  // Standard CPM algorithm:
  // 1. Topological sort of task graph (detect cycles, throw if present)
  // 2. Forward pass: compute early_start, early_finish for each task
  // 3. Backward pass: compute late_start, late_finish starting from project end
  // 4. total_float = late_start - early_start (in days)
  // 5. Tasks with total_float = 0 are on the critical path
  // Return Map keyed by task_id with full analysis.
}
```

Write Vitest tests:
- Linear chain (A → B → C): all on critical path, float 0
- Branching (A → B, A → C, B → D, C → D): longer branch on critical path
- Parallel independent tasks: both have float = project end - task finish
- Task with no dependencies at project start: on critical path if on longest chain
- Cycle detection: throws clear error

Run `npx vitest run` — tests must pass.

### 5. Build the Gantt component
`src/components/gantt/GanttChart.tsx`:
- Server component wrapper fetches tasks + dependencies + critical path analysis
- Client component (`'use client'`) renders the Gantt using the chosen library
- Takes props: `tasks`, `dependencies`, `criticalPath: Set<string>`, `userRole`, `onTaskDrag`, `onTaskClick`
- Phase swim lanes: tasks grouped by `phase` field, horizontal bands with subtle background tint per phase (Phase 1 = light green, 1.5 = lighter green, 2 = blue-50, 3 = purple-50, PM = gray-50)
- Milestone diamonds: `is_milestone=true` tasks render as diamonds, not bars
- Today-line: vertical yellow line at today's date
- Critical path: tasks in the critical path set render with red fill; others render with the CME bright-green fill
- Dependency arrows: SVG overlay showing finish-to-start arrows between dependent tasks
- Drag events:
  - Drag bar body → shift start + finish (same duration)
  - Drag bar edges → resize (adjust start or finish)
  - On drop, call `onTaskDrag(taskId, newStart, newFinish)` — parent decides what to do
- Click event calls `onTaskClick(taskId)` — opens drawer

### 6. Gantt page at `/p/[slug]/gantt/page.tsx`
- Server component loads tasks + dependencies + critical path from Supabase
- Renders `<GanttChart>` full-width
- Renders `<TaskDetailDrawer>` conditionally when a task is selected (URL-driven: `?task=<uuid>`)
- Renders a filter bar at top: phase filter, milestone-only toggle, "show critical path only" toggle
- Above the Gantt, show a small legend: Critical path (red), On schedule (green), Milestone (diamond), Today (yellow line)

### 7. Task detail drawer component
`src/components/tasks/TaskDetailDrawer.tsx`:
- Slides in from the right when a task is selected
- Closes on X, ESC, or clicking outside
- Top section: task name, WBS, phase badge, status badge
- Dates section: start, finish, duration in days, total float, is-on-critical-path indicator
  - CME Admin: fields are inline-editable (direct edit on blur)
  - Others: fields show a small pencil icon; click opens "Suggest edit" dialog that creates a draft
- Resources section: list of assigned resources with hours + computed cost per resource
- Cost breakdown section: full rate-period breakdown using `computeCostForTaskResource`
  - Format: "2026: 12 hrs × $407.04 = $4,884.48 · 2027: 8 hrs × $419.25 = $3,354.00"
- Dependencies section:
  - "Predecessors" list: tasks that must finish before this one starts
  - "Successors" list: tasks that can't start until this finishes
  - "Add predecessor" button opens searchable task picker (CME Admin direct, others creates draft)
- Comments section: placeholder (Session 6 wires this)
- Footer: "Open in full view" link; "Close" button

### 8. Drag-to-edit wiring

When a user drags a task on the Gantt:

**CME Admin path:**
- Optimistically update the UI
- PATCH `/api/workplan-tasks/:id` with new start_date + finish_date
- Server revalidates, writes to canonical `workplan_tasks`, writes audit_log entry
- If server error: revert UI and show toast

**CME Viewer + ACTC path:**
- Optimistically update the UI in yellow "draft" state
- POST `/api/proposed-changes` with operation=update, entity_type=workplan_task, entity_id, change_data={start_date: {old, new}, finish_date: {old, new}}
- Server creates the draft and returns
- Bar stays yellow until user submits the draft (Session 6 feature)
- User gets a toast: "Draft created. Review and submit from your Drafts tray (coming Session 6)."

API routes to create:
- `PATCH /api/workplan-tasks/[id]/route.ts` — CME Admin direct edits
- `POST /api/proposed-changes/route.ts` — any user creates a draft
- Both enforce RLS server-side

### 9. Mobile fallback
Detect viewport width below 768px via Tailwind responsive classes (or a client-side `useMediaQuery`). At narrow widths:
- Hide the Gantt component
- Render a vertical timeline list: tasks grouped by phase, each task is a card with start/finish dates, a mini duration bar, status badge, critical-path indicator if applicable
- Tap a card → drawer opens (same drawer component)
- No drag editing on mobile; drawer has date pickers for adjustments

### 10. Add Gantt to project sidebar nav
Update `src/app/(app)/p/[slug]/layout.tsx` — add "Gantt" link between "Tasks" and "Milestones" in the sidebar.

### 11. Run lint, build, test
```bash
npm run lint
npm run build
npx vitest run
```
All three must pass clean. Do NOT proceed to deploy with failures.

### 12. Commit + push + deploy
```bash
git add .
git commit -m "Session 4: Editable Gantt with dependencies and critical path"
git push
```
Vercel auto-deploys.

### 13. Smoke test on Vercel

Verify on `cme-client-portal.vercel.app`:
- `/p/a26-0057/gantt` loads
- 90 tasks + 9 milestones render on the timeline
- Phase swim lanes visible with different backgrounds
- Today-line (Apr 19 or newer) in yellow
- At least one critical path (red) visible — likely the 1.1.1 → 1.4.1 → 1.5.5 → 1.5.7 → 1.10.2 → M5 chain
- Clicking a task opens the drawer with cost breakdown
- Dependencies render as arrows
- Resize the browser to ~400px wide — vertical list appears instead of Gantt
- Dependency from the drawer: the "Add predecessor" picker works

Spot-check the critical path: whatever chain Claude Code computes, the end should feed into a milestone (most likely M8 Production Cutover). Total duration from May 1, 2026 to Apr 30, 2027 should be 365 days. If critical path length is wildly different, there's a bug in the CPM algorithm.

### 14. Report

Report back with:
- Live Vercel URL
- Which Gantt library was chosen and why
- Screenshot of the Gantt page (desktop view)
- Screenshot of the mobile fallback
- Screenshot of the task detail drawer open
- Rowcounts: `task_dependencies` inserted, critical path length (count of tasks), longest non-critical chain
- Vitest output
- Anything ambiguous or deferred

## Out of scope for Session 4
- Cost dashboard / cross-filter bars (Session 5)
- Drafts tray UI (Session 6) — drafts are created in DB this session but users can't view or submit them yet
- Submit-for-review flow (Session 6)
- Exports (Session 6)
- AI assistant (Session 7)
- Custom WBS hierarchy indentation (defer — phase swim lanes are enough for v1)
- Task grouping beyond phase (defer)

## Pause and ask if
- Gantt library trial reveals a blocker (e.g., drag-to-edit doesn't work cleanly with React 18 server components)
- Critical path algorithm fails tests in an unexpected way (suggests bad dependency data)
- Dependency seeds produce a cycle (indicates a logic error in the seed mapping)
- Any RLS policy change breaks existing Session 3 functionality

## Design constraints (important)
- Stick to CME colors — bright-green #3C9D48 for on-schedule bars, red #E85F46 for critical path, yellow #FFCB0E for today-line, dark-green #25532E for phase swim lane text
- Dependency arrows subtle — gray, thin, with small arrowhead; not visually dominant
- Drag affordance: visible on hover only (resize handles, move cursor)
- Drawer max-width: 560px on desktop, full-width on mobile
- Font consistency: Raleway body, Oswald headings (same as Session 1 tokens)
