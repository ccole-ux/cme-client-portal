# CME Client Portal — Claude Code Session 5 Kickoff

**Target:** Cost dashboard with four cross-filter bar charts, monthly breakdown table, and cumulative burn chart.
**Expected duration:** 60–75 min on Opus 4.7 Max.
**Prerequisites:**
- Session 4 deployed (Gantt + critical path + drag-to-edit + dependencies working at `/p/a26-0057/gantt`)
- `docs/cme_client_portal_spec.md` v1.2 in the repo
- Fresh Claude Code budget window

---

## What you do BEFORE pasting this prompt

- **Verify Session 4 still works.** `/p/a26-0057/gantt` loads, critical path shows 29 red tasks, left-side task table is sticky, drawer opens correctly. If anything regressed, fix before starting Session 5.
- **Decide if you want a "brand polish" pass first.** Not required, just mentioning. This session adds 4 charts + 1 large chart + 1 table to one page — if the page starts feeling crowded, we may want a typography/spacing pass in Session 5.5. We'll evaluate at end of this session.

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal, Session 5 of 7. Sessions 1–4 are deployed. Project slug is `a26-0057`. Read `docs/cme_client_portal_spec.md` before starting — sections 7, 10, 12 matter most.

## Session 5 goal

Add a cost dashboard that makes financial data explorable for ACTC reviewers. After this session:
- `/p/a26-0057/costs` renders four cross-filter bar charts (by firm, by user, by phase, by month)
- Each chart has Hours / Dollars tabs (two metrics, one axis per tab)
- Clicking a bar applies a filter; filters compose with AND; filtered state reflected in URL as query params
- A monthly breakdown table below the charts shows hours + dollars per month with optional per-resource and per-phase groupings
- A cumulative burn chart shows planned cost accumulating over time (baseline) — ready to overlay forecast once the drafts-tray workflow (Session 6) creates proposed changes
- Exports-ready data shape: internal structure mirrors what Session 6's `/api/export/workplan/canonical` will serialize
- Deployed to Vercel

## Tasks in order

### 1. Install charting dependencies (if not already present)
```bash
npm list recharts >/dev/null 2>&1 || npm install recharts
```
We already specced recharts in Session 3. Verify it's installed. No new dependencies expected.

### 2. Build the cost aggregation layer

Create `src/lib/costs/aggregate.ts`:

```ts
import { computeCostForTaskResource, RateHistoryRow } from '@/lib/rates/compute';

export type TaskResourceRow = {
  task_id: string;
  wbs: string;
  task_name: string;
  phase: string;
  start_date: string;
  finish_date: string;
  resource_id: string;
  resource_name: string;
  firm: string;
  hours: number;
};

export type CostAggregation = {
  key: string;         // grouping key (e.g., 'CME' or 'Phase 1' or '2026-08')
  label: string;       // display label
  hours: number;
  cost: number;
  task_ids: string[];  // for filter reverse-lookup
  resource_ids: string[];
};

export type MonthlyBreakdownRow = {
  year_month: string;  // '2026-08'
  label: string;       // 'Aug 2026'
  hours_by_phase: Record<string, number>;
  cost_by_phase: Record<string, number>;
  hours_by_firm: Record<string, number>;
  cost_by_firm: Record<string, number>;
  total_hours: number;
  total_cost: number;
};

// Given all task-resource rows + rate history, aggregate by dimension
export function aggregateByFirm(rows: TaskResourceRow[], rates: RateHistoryRow[]): CostAggregation[];
export function aggregateByResource(rows: TaskResourceRow[], rates: RateHistoryRow[]): CostAggregation[];
export function aggregateByPhase(rows: TaskResourceRow[], rates: RateHistoryRow[]): CostAggregation[];
export function aggregateByMonth(rows: TaskResourceRow[], rates: RateHistoryRow[]): CostAggregation[];

// Two-dimensional breakdown for the table
export function buildMonthlyBreakdown(rows: TaskResourceRow[], rates: RateHistoryRow[]): MonthlyBreakdownRow[];

// Cumulative spend over time — output is one point per week or per day depending on zoom
export type BurnPoint = {
  date: string;           // YYYY-MM-DD
  planned_cumulative_cost: number;
  planned_cumulative_hours: number;
};
export function computeBaselineBurn(
  rows: TaskResourceRow[],
  rates: RateHistoryRow[],
  startDate: string,
  endDate: string,
  granularity: 'day' | 'week' | 'month' = 'week'
): BurnPoint[];
```

**Key rule:** monthly aggregation uses the rate engine correctly. A task spanning August–October 2026 contributes its August days to the August bucket at 2026 rates. A task crossing Dec 31/Jan 1 contributes December 2026 days at 2026 rates and January 2027 days at 2027 rates. Burn chart integrates these daily costs into a cumulative curve.

Write Vitest tests in `src/lib/costs/aggregate.test.ts`:
- `aggregateByFirm` — totals match sum of all task-resource costs; CME, DAVTEQ, SQL & Sightline, ACUMEN, Tricertus all present
- `aggregateByMonth` — May 2026 through April 2027 all present; total sum equals baseline $1,356,256 (within rounding)
- `buildMonthlyBreakdown` — for a task spanning Aug–Sep 2026, confirm hours split proportionally by calendar days, bucketed correctly
- `computeBaselineBurn` — first point = 0, last point ≈ $1,356,256, monotonically non-decreasing
- Rate boundary test — task spanning Dec 20 2026 → Jan 10 2027 has 12 days in Dec at $407.04 and 10 days in Jan at $419.25 (for Cole); verify split is correct

Run `npx vitest run src/lib/costs` — tests must pass.

### 3. Filter composition hook

Create `src/hooks/useCostFilters.ts`:

```ts
export type CostFilters = {
  firms: string[];      // empty array = no filter
  resource_ids: string[];
  phases: string[];
  year_months: string[]; // '2026-08'
};

export function useCostFilters(): {
  filters: CostFilters;
  setFilter: (dimension: keyof CostFilters, value: string) => void;  // toggle: add if absent, remove if present
  clearAll: () => void;
  isFiltered: boolean;
  filterRows: (rows: TaskResourceRow[]) => TaskResourceRow[];  // apply filters to input
};
```

Filter state syncs to URL query params using Next's `useSearchParams` + `router.replace`:
- `?firm=CME&firm=DAVTEQ` → firms: ['CME', 'DAVTEQ']
- `?month=2026-08` → year_months: ['2026-08']
- `?phase=1&phase=2` → phases: ['1', '2']
- `?resource=<uuid>` → resource_ids: ['<uuid>']

Any filter set creates a filter pill displayed at the top of the page.

### 4. Build the four cross-filter bar charts

Component: `src/components/costs/CrossFilterBars.tsx` (`'use client'`).

Layout: 2×2 grid on desktop (min 1280px), stacks vertically on tablet/mobile.

Each of the four charts (Firm, Resource, Phase, Month) is a reusable `<CostBarChart>` component:

```tsx
<CostBarChart
  title="By Firm"
  dimension="firm"
  aggregations={aggregationsByFirm}
  selectedKeys={filters.firms}
  onBarClick={(key) => setFilter('firms', key)}
  metric={activeMetric}  // 'hours' | 'cost'
/>
```

Each chart has **Hours / Dollars tabs** at the top (shadcn Tabs component).
- Hours tab → y-axis in hours, formatted like `1,252`
- Dollars tab → y-axis in dollars, formatted like `$325,520`

Tab state is LOCAL to each chart — user can view Firm by hours and Phase by dollars simultaneously.

Bar styling:
- Default: CME bright-green (#3C9D48)
- When the bar's key IS in `selectedKeys`: CME dark-green (#25532E) — stands out as "active filter"
- Hover: subtle darken + tooltip showing hours + cost + task count
- Cursor: pointer

**Month chart** is stacked horizontally by phase (Phase 1 in dark-green, 1.5 in lighter green, 2 in blue-500, 3 in purple-500, PM excluded from critical-path but still shown in gray-400). Click any segment to add a (month, phase) double filter.

**Resource chart** sorted by total descending; only shows top 8 (which is all of them for PCS).

### 5. Build the monthly breakdown table

Component: `src/components/costs/MonthlyBreakdownTable.tsx`.

Layout: table with months as rows, columns dynamically reflecting current grouping.

Group-by toggle at top right (shadcn RadioGroup):
- **By Phase** (default): columns = Phase 1, 1.5, 2, 3, PM, Total
- **By Firm**: columns = CME, DAVTEQ, SQL & Sightline, ACUMEN, Tricertus, Total
- **By Resource**: columns = all 8 resources + Total (wide table; add horizontal scroll)

Rows: May 2026 through April 2027 (12 rows). Total row at bottom.

Cell values switch between Hours and Dollars based on a single Hours/Dollars toggle at the top of the table (independent from the charts — some users want charts in $ but table in hours).

Table respects current filters — if Firm: CME is set, the table only shows CME contribution.

Cell click → adds the (month, phase/firm/resource) filter pair. Same filter pattern as the month chart.

### 6. Build the cumulative burn chart

Component: `src/components/costs/CumulativeBurn.tsx`.

Single line chart showing planned cumulative cost from kickoff (May 1 2026) to target complete (Apr 30 2027):
- X-axis: months May 2026 through April 2027
- Y-axis: cumulative dollars, $0 → $1,356,256
- Line: CME bright-green, 2px, smooth curve
- Shaded area below line: 10% opacity
- Annotations: small diamond markers at milestones (M1-M8, M3.5) with hover tooltips showing milestone name + cumulative $ at that point
- Today-line: vertical dashed yellow line at today's date

Hours/Dollars tab at the top switches y-axis metric.

This chart ignores current cross-filters (it shows the full-project baseline always). Add a small note: *"Baseline planned spend. Forecast overlay added when drafts are submitted (Session 6)."*

### 7. Build the Costs page

`src/app/(app)/p/[slug]/costs/page.tsx`:
- Server component loads all task-resource rows + rate history
- Pre-computes all aggregations (fast — 200 task-resource rows, 24 rate rows)
- Passes down to client components

Page layout top-to-bottom:

1. **Header** — "Costs" with a brief subtitle: "Planned spend across A26-0057. Click any bar, table cell, or resource to filter."
2. **Active filter pills** (horizontal, shown only when filters are set) with "Clear all" button on the right
3. **Cross-filter bars** (2x2 grid)
4. **Monthly breakdown table**
5. **Cumulative burn chart**
6. **Export button** (top right of the page, placeholder `<Button disabled>Download (Session 6)</Button>`)

### 8. Add Costs to sidebar nav

Update `src/app/(app)/p/[slug]/layout.tsx` — add "Costs" link between "Gantt" and "Resources" in the project sidebar nav.

### 9. Run lint, build, test
```bash
npm run lint
npm run build
npx vitest run
```
All three must pass. Do NOT deploy if any fail.

### 10. Commit + push
```bash
git add .
git commit -m "Session 5: Cost dashboard with cross-filter bars, monthly table, cumulative burn"
git push
```
Vercel auto-deploys.

### 11. Smoke test on production

Open `cme-client-portal.vercel.app/p/a26-0057/costs`:

- Four bar charts render with real data
- Hours tab on the Firm chart shows CME at top (~1,548 hrs), DAVTEQ (~1,388), SQL & Sightline (1,252), etc.
- Dollars tab on the Firm chart shows CME at top (~$600K), DAVTEQ (~$329K), SQL & Sightline (~$325K)
- Clicking "CME" bar applies Firm: CME filter — other charts and the table re-render showing only CME contribution
- Clicking "Aug 2026" on the Month chart adds that as a second filter — pill appears at top
- "Clear all" resets everything; URL clears to `/p/a26-0057/costs` with no params
- Monthly breakdown table shows 12 rows (May 2026 → Apr 2027)
- By Phase grouping: Phase 1 column sums to $1,002,734 across the 6 months of Phase 1 (May–Oct)
- By Firm grouping: CME column total = ~$600K ± rounding
- Cumulative burn chart ends at approximately $1,356,256 on Apr 30, 2027
- Cumulative burn chart starts at $0 on May 1, 2026
- Milestone diamonds visible on burn chart
- Today-line on burn chart (at today's date, which is currently to the LEFT of the chart since project hasn't started)
- Mobile view: 2x2 grid becomes 1-column, table gets horizontal scroll, burn chart stays readable

Spot-check: **total of all Firm-dimension bars in Dollars mode should equal ~$1,356,256.** If not, the rate engine or aggregation has a bug.

### 12. Report back with:
- Live Vercel URL
- Screenshots of: costs page default view, costs page with CME + Aug 2026 filter applied, cumulative burn chart
- Vitest output (all tests pass)
- Any filter interactions that don't feel right
- Confirmation of the $1,356,256 total check

## Out of scope for Session 5
- Forecast overlay on the burn chart — needs Session 6's drafts-tray data model
- Exports (Session 6)
- AI assistant integration (Session 7)
- Per-task cost drill-down from the table (defer — filter already narrows the Gantt)
- Animated transitions on filter changes (stretch goal — leave static if time constrained)

## Pause and ask if
- Aggregation tests fail unexpectedly (indicates rate engine bug)
- Total Firm dollars doesn't match $1,356,256 baseline
- Filter URL params don't round-trip cleanly through middleware auth redirect
- Mobile layout becomes unreadable

## Design constraints
- Keep CME colors consistent: bright-green primary, dark-green for "active filter", yellow for today-line, red only for critical path (already on the Gantt page, not this page)
- Raleway body / Oswald headings throughout
- No animation libraries; CSS transitions only
- No tooltips on bars that duplicate the label — tooltips should show additional info (task count, breakdown by sub-dimension)
