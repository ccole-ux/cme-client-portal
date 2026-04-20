# CME Client Portal — Claude Code Session 3 Kickoff

**Target:** Seed the database from `ACTC_PCS_Workplan_v8.xlsx`, build the rate escalation engine, capture the initial baseline snapshot, scaffold basic list views.
**Expected duration:** 75–90 min.
**Prerequisites:**
- Session 2 deployed (auth + schema + admin skeleton live at `cme-client-portal.vercel.app`)
- `docs/cme_client_portal_spec.md` v1.2 in the repo
- `docs/ACTC_PCS_Workplan_v8.xlsx` in the repo
- `docs/PCS_Status_Narrative.md` in the repo
- CME Admin user seeded (Chris's email) — confirm by logging in before starting this session

---

## What you do BEFORE pasting this prompt

- **Verify Session 2 works.** Open `cme-client-portal.vercel.app`, log in with your email, confirm you land on an authenticated page. Spot-check `/admin` shows the admin cards. If anything's broken, fix it before starting Session 3.
- **Confirm the xlsx and narrative are in `docs/`.** Run `ls docs/` in your terminal. You should see both files there.
- **Nothing else.** No new external services in this session. Everything runs inside the existing Supabase project.

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal, Session 3 of 7. Session 2 (schema + auth + admin skeleton) is deployed. Read `docs/cme_client_portal_spec.md` before starting. Sections 6, 7, 13, 14 matter most.

## Session 3 goal

Load real data into the portal. After this session finishes:
- The ACTC PCS project exists in the database
- All 8 resources exist with 2026 + 2027 + 2028 date-effective rates
- All 180 workplan tasks exist with their resource assignments, all `status='Not Started'`
- All milestones exist, flagged `is_milestone=true`
- All 45 rA1 deliverables exist
- Narrative sections from `PCS_Status_Narrative.md` exist
- One initial `workplan_snapshots` row exists, type `accepted_version`, label `"v8 Baseline Apr 19 2026"`
- Basic list views render at `/p/actc-pcs/`, `/p/actc-pcs/tasks`, `/p/actc-pcs/resources`, `/admin/rates`
- Rate escalation utility has unit tests covering year-boundary splits, 3% Jan 1 compounding, leap years, same-year tasks
- Deployed to Vercel and working in production

## Tasks in order

### 1. Install dependencies
```bash
npm install xlsx vitest @vitest/ui date-fns
npm install -D @types/node
```

### 2. Build the rate escalation engine

Create `src/lib/rates/compute.ts` per spec section 7:

```ts
import { differenceInCalendarDays, startOfYear, endOfYear, isAfter, isBefore, addDays } from 'date-fns';

export type RateHistoryRow = {
  id: string;
  resource_id: string;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null;
  rate_loaded: number;
  rate_source: string;
};

export type TaskResource = {
  start_date: string;
  finish_date: string;
  hours: number;
};

export type CostPeriodBreakdown = {
  year: number;
  period_start: string;
  period_end: string;
  period_days: number;
  period_hours: number;
  rate: number;
  period_cost: number;
  rate_source: string;
};

export type CostComputation = {
  total_cost: number;
  total_hours: number;
  breakdown: CostPeriodBreakdown[];
};

export function computeCostForTaskResource(
  task: TaskResource,
  rateHistory: RateHistoryRow[]
): CostComputation {
  // Implement date-range split by rate periods per spec section 7:
  // 1. Parse start + finish
  // 2. Find overlapping rate_history rows
  // 3. For each overlap, compute period_days, period_hours = hours * (period_days / total_task_days)
  // 4. period_cost = period_hours * rate
  // 5. Sum all period_cost for total_cost
  // Return breakdown and totals.
  // Handle edge cases: task spans year boundary, leap year (366 days), rate period ends mid-task.
  // If no rate found for part of task, throw descriptive error.
}

// Helper — given resources, generate 3% compound escalation rows for a year range
export function generateEscalatedRates(
  baselineRate: number,
  baselineYear: number,
  throughYear: number,
  baselineSource: string
): { effective_from: string; effective_to: string; rate_loaded: number; rate_source: string }[] {
  // Year N rate = year 0 rate * (1.03 ** (N - baselineYear))
  // Round to 2 decimals to match B7 rate schedule precision.
  // Return array of rows suitable for insertion.
}
```

Write comprehensive unit tests in `src/lib/rates/compute.test.ts`:
- Task entirely in 2026 — single period, cost = hours × 2026 rate
- Task entirely in 2027 — single period at 2027 escalated rate
- Task spanning 2026/2027 boundary — two periods, prorated by days
- Task spanning 2026 through 2028 — three periods, compounding escalation
- Leap year handling (2028 has 366 days — confirm day-count math)
- Very short task (1 day) — sanity check no division by zero
- `generateEscalatedRates` — 2026 → 2028, confirm rates at $407.04 → $419.25 → $431.83 (±$0.01)

Run `npx vitest run` — all tests must pass before moving on.

### 3. Build the seed script

Create `scripts/seed-from-workplan.ts`. Uses `SUPABASE_SECRET_KEY` for direct DB writes (bypasses RLS).

Script phases:

**Phase A — resources**
Read `docs/ACTC_PCS_Workplan_v8.xlsx` Resource Summary table (rows 225–232). Insert 8 rows into `resources`:

| full_name | firm | b7_classification | role |
|-----------|------|-------------------|------|
| Chris Cole | CME (Prime) | Project Manager | Project Lead |
| Ali Mortazavi | DAVTEQ | Principal | AI Architect |
| Jason Brown | DAVTEQ | Sr. Full Stack | Developer |
| Tom Nassayan | SQL & Sightline Solutions | President/Sr. | Database & Tableau |
| Mark Nipper | CME (Prime) | PC Specialist | Documentation + Cleanup Lead |
| Steven Salzwedel | ACUMEN | PC Advisor | ACTC Compliance & Standards |
| Eric Chang | Tricertus LLC | Programmer | Testing + Data Cleanup |
| Hanuel Lee | Tricertus LLC | PC Administrator | Testing + Data Cleanup |

(Exact classifications and 2026 rates from the Resource Summary block of the xlsx — read programmatically rather than hard-coding. Rates seed `resource_rate_history` in Phase B, not `resources`.)

**Phase B — rate history**
For each resource, insert three rows into `resource_rate_history`:
- 2026-01-01 → 2026-12-31, rate from xlsx, source `"B7 R26-003 2026"`
- 2027-01-01 → 2027-12-31, escalated via `generateEscalatedRates`, source `"Calendar 2027 +3%"`
- 2028-01-01 → 2028-12-31, further escalated, source `"Calendar 2028 +3%"`

Baseline rates you should see in xlsx row 225–232 column D:
- Cole 407.04 / Mortazavi 278.30 / Brown 217.80 / Nassayan 260.00 / Nipper 341.01 / Salzwedel 216.66 / Chang 102.89 / Lee 114.65

**Phase C — project**
Insert one row into `projects`:
```
name: "PCS SaaS Replacement"
client_name: "Alameda County Transportation Commission"
client_short: "Alameda CTC"
slug: "actc-pcs"
baseline_year: 2026
kickoff_on: 2026-05-01
status: "active"
started_on: null
target_complete_on: 2027-04-30
total_hours_baseline: 4912
total_cost_baseline: 1356256
description: [insert short description from narrative intro]
```

**Phase D — tasks**
Read rows 6–220 of the "PCS Workplan v8" sheet.

For each row:
- Skip rows where column B (Task/Deliverable) is null
- Skip rows where column A matches "^M\\d" AND no hours — those are milestone marker rows, handle in Phase E
- Skip rows where column A = "PM" or B contains "Subtotal" or "PHASE" header rows — those are grouping rows
- For rows with a resource assignment (column E non-null AND column F non-null):
  - Insert or get-existing `workplan_tasks` row keyed by (project_id, wbs)
  - Insert `workplan_task_resources` row linking task + resource + hours

**WBS parsing rule:** The xlsx groups multiple resource rows under the same WBS. Use `INSERT ... ON CONFLICT (project_id, wbs) DO NOTHING` to avoid duplicates. The first row for a WBS defines task_name, start_date, finish_date, phase, sort_order.

**phase parsing:** From WBS — `"1.0"` through `"1.11"` → phase `"1"`. `"1.5A"` → phase `"1.5"`. `"2.x"` → `"2"`. `"3.x"` → `"3"`. `"PM.x"` → `"PM"`.

**Status:** All inserted tasks → `status='Not Started'`, `is_milestone=false`, `is_published=true`.

**Phase E — milestones**
For each row where column A matches `"^M\\d"` (M1, M2, M3, M3.5, M4, M5, M6, M7, M8):
- Insert `workplan_tasks` row with `is_milestone=true`, `task_name` from column B (strip `★ ` prefix), `finish_date` from column D, `start_date = finish_date`, `hours=0`, `status='Not Started'`.
- No `workplan_task_resources` rows for milestones.

**Phase F — deliverables**
Read the "Contract Deliverables (rA1)" sheet (rows 2–46, roughly). Insert 45 rows into `deliverables`:
- `ref_code` from column A
- `title` from column B
- `description` from column C
- `wbs_links` from column D (parse comma-separated list into text[])
- `due_date` from column E
- `status: "Not Started"`
- `sort_order` = row number

If the sheet structure differs from this expected layout, pause and ask me — don't guess.

**Phase G — narrative**
Read `docs/PCS_Status_Narrative.md`. Parse by H2 headings (`^## `). Insert one `narrative_sections` row per section:
- `section_key` = slug of heading (e.g., "executive-summary")
- `title` = heading text
- `body_markdown` = content until next H2
- `sort_order` = N (1-indexed)
- `is_published` = true

**Phase H — initial baseline snapshot**
After all above phases succeed, capture one snapshot in `workplan_snapshots`:
- `snapshot_type` = `"accepted_version"`
- `snapshot_label` = `"v8 Baseline Apr 19 2026"`
- `version_number` = 1 (trigger handles this automatically)
- `captured_by` = Chris's user_id
- `data` = JSON serialization of all current workplan_tasks + workplan_task_resources + milestones
- `narrative_data` = JSON serialization of all narrative_sections
- `notes` = `"Initial baseline captured at Session 3 seed. All tasks Not Started per pre-kickoff state."`

Script must be idempotent: running it twice should not produce duplicates. Use `ON CONFLICT DO NOTHING` or existence checks before insert. Log clear output for each phase (e.g., `Phase A: inserted 8 resources`).

Run the script:
```bash
npx tsx scripts/seed-from-workplan.ts
```

### 4. Build basic list views

Add shadcn Table component if not already present:
```bash
npx shadcn@latest add table badge
```

**`/p/[slug]/layout.tsx`** — project layout wrapping all project pages. Header bar with project name, breadcrumb, CME branding. Sidebar nav: Overview, Tasks, Resources, Milestones (others stubbed for future sessions).

**`/p/[slug]/page.tsx`** — Project Overview:
- Project metadata card (name, client, kickoff date, target complete, baseline hours, baseline cost)
- Status summary: "180 tasks Not Started, 0 In Development, 0 Accepted"
- Phase summary: 4 cards (Phase 1, 1.5, 2, 3) with hour totals per phase
- Narrative sections rendered from `narrative_sections` (markdown → HTML using `react-markdown`)
- Download button placeholder (Session 6 wires the export endpoints)

**`/p/[slug]/tasks/page.tsx`** — Task List:
- Searchable, filterable table
- Columns: WBS | Task | Phase | Start | Finish | Hours | Cost | Status
- Cost computed via `computeCostForTaskResource` summed per task across all resources
- Filters: phase (dropdown), status (dropdown), text search
- Status badges using the 6-status color scheme from spec section 5
- Clicking a row shows a placeholder modal ("detail drawer coming in Session 4")

**`/p/[slug]/resources/page.tsx`** — Resource List:
- Table of all 8 resources
- Columns: Name | Firm | Role | Current Rate (2026) | Total Hours Assigned | Total Cost
- Clicking a resource shows rate history mini-timeline (2026 → 2028)

**`/admin/rates/page.tsx`** — Rate History Editor:
- Table of all `resource_rate_history` rows grouped by resource
- Columns: Resource | Year | Effective From | Effective To | Rate | Source
- "Edit" button on each row (CME Admin only) — opens modal to adjust rate
- On save, write to DB and trigger recalc of affected task costs (just invalidate; recompute is lazy on next read)

### 5. Run lint, build, test
```bash
npm run lint
npm run build
npx vitest run
```
Fix any errors. Do NOT proceed to deploy until all three pass clean.

### 6. Commit + push + deploy
```bash
git add .
git commit -m "Session 3: Seed + rate engine + baseline snapshot + list views"
git push
```
Vercel auto-deploys on push. Wait for deploy, then verify on production.

### 7. Smoke test on Vercel (production only)

Open `cme-client-portal.vercel.app`, log in, navigate to:

- `/` — should show ACTC PCS project in list
- `/p/actc-pcs` — should render overview with 180 Not Started tasks, 4,912 hours, $1,356,256, narrative rendered in multiple sections
- `/p/actc-pcs/tasks` — should show filterable table with 180 tasks
- `/p/actc-pcs/resources` — should show 8 resources with 2026 rates matching xlsx
- `/admin/rates` — should show 24 rate history rows (8 resources × 3 years)

Spot-check a handful of task costs — e.g., a simple Phase 1 task entirely in 2026. Formula: `hours × rate`. If cost is wrong, the rate engine has a bug.

Spot-check one cross-year task — PM.1 (Cole oversight, May 1 2026 → Apr 30 2027). Expected: 68 hours split by calendar days, ~8/12ths at 2026 rate and ~4/12ths at 2027 rate. Total cost ≈ 68 × ((245/365 × $407.04) + (120/365 × $419.25)) = roughly $28,100.

### 8. Final report

Report back with:
- Live Vercel URL (likely unchanged, just verify it works)
- Count of rows inserted per table (`resources`, `resource_rate_history`, `workplan_tasks`, `workplan_task_resources`, `deliverables`, `narrative_sections`, `workplan_snapshots`)
- Screenshots or descriptions of: overview page, task list, resource list, rates admin page
- Vitest output summary (all tests passing)
- Any discrepancies between the xlsx and what ended up in the database

## Out of scope for Session 3
- Editable Gantt (Session 4)
- Cross-filter dashboard (Session 5)
- Drafts, submissions, review queue, comments, documents, exports (Session 6)
- AI assistant (Session 7)
- Modifying rate escalation to anything other than 3% calendar Jan 1 (confirmed in spec)

## Do not improvise
If the xlsx structure is unclear, pause and ask. If the narrative parsing fails on any section, pause and ask. If the rate engine tests fail, stop and debug before continuing. Do not guess around bad data.

## Cost breakdown display pattern (for later sessions, do not build yet)
Keep `computeCostForTaskResource` returning the `breakdown` array. Sessions 4 and 5 will render it as: *"2026: 12 hrs × $407.04 = $4,884.48 · 2027: 8 hrs × $419.25 = $3,354.00"* in task detail drawers and tooltips.
