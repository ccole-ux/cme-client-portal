# CME Client Portal — Master Spec Document

**Prepared by:** Chris Cole, Cole Management & Engineering (CME)
**Version:** 1.2 (Apr 19, 2026)
**Purpose:** Master reference for designing and building the CME Client Portal — a CME-branded proposal and project status portal for sharing with clients, beginning with the Alameda CTC PCS program.

> **How to use this document:** This is the project-knowledge equivalent of `actc_pcs_project_context.md`, but for the CME Client Portal. Drop this file into a new Claude Project to keep the portal's context isolated from the PCS app's context.

---

## 1. Project overview

A CME-branded web portal where clients can review CME's proposal content, project status, deliverables, time-phased cost data, and workplan progress — and leave comments or suggest changes that CME reviews before accepting. Editable schedule and scope, auto-recalculated costs with date-effective rates, a built-in AI assistant that helps users surface insights and *propose* changes (never commit them directly), a cross-filter dashboard, and PDF/Excel/CSV exports of any workplan version.

**Users**
- **CME internal** — Chris Cole, Mark Nipper, any CME staff administering or viewing the portal
- **Client reviewers** — Alameda CTC stakeholders initially; portal is reusable for future CME clients

**First client project**
Alameda CTC — PCS SaaS Replacement. Seed data from `ACTC_PCS_Workplan_v8.xlsx`, `PCS_Status_Narrative.md`, and the rA1 Contract Deliverables sheet.

---

## 2. Status taxonomy

Status values apply to workplan tasks, milestones, and deliverables. **Work is Not Started until the contract formally begins on May 1, 2026. Work is not Complete until ACTC formally accepts it.**

| Status | Meaning |
|--------|---------|
| **Not Started** | Planned per workplan; work has not yet begun under the contract. |
| **In Development** | Work is actively underway under the contract after May 1, 2026. Not yet submitted to ACTC. |
| **Submitted for Review** | Formally submitted to ACTC for review. Awaiting feedback or acceptance. |
| **Accepted** | ACTC has formally accepted. Only CME Admin can set this status. |
| **Rejected** | ACTC reviewed and explicitly rejected. Requires CME response. |
| **Deferred** | Descoped or postponed beyond the current plan. |

As of April 19, 2026 (pre-kickoff), every workplan line is `Not Started`. The Claude Code prototype at `actc-pcs.vercel.app` is a CME-funded pre-contract exploration and does not affect line-item status.

---

## 3. Users and roles

Five roles, enforced via Supabase Row-Level Security (RLS).

| Role | Read project | Comment | Direct-edit | Propose | Approve/reject | See all submissions | Invite | Admin |
|------|--------------|---------|-------------|---------|----------------|---------------------|--------|-------|
| **CME Admin** | All | ✓ | ✓ (logged) | via direct-edit | ✓ | ✓ | ✓ | ✓ |
| **CME Reviewer** | All | ✓ | — | ✓ | ✓ | ✓ | — | — |
| **CME Viewer** | All | ✓ | — | ✓ | — | ✓ | — | — |
| **ACTC Reviewer** | Their project(s) | ✓ | — | ✓ | — | Only own | — | — |
| **ACTC Viewer** | Their project(s) | ✓ | — | — | — | Only own | — | — |

Submission visibility rule: **A submission is visible to its submitter plus all CME staff. Other users in the project do not see others' submissions.**

Direct-edit actions by CME Admin create audit_log entries but bypass the proposal/submission workflow. CME Reviewers get the accept/reject workflow without the direct-edit or user-management powers of an admin — useful for delegating review without giving away canonical-write access.

---

## 4. Tech stack decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 14 + TypeScript + Tailwind | Same as PCS |
| Auth | Supabase Auth — magic link + Google OAuth | Magic link for client reviewers; Google for CME |
| Database | Supabase PostgreSQL (new project) | Isolated, own RLS, independent backups |
| File storage | Supabase Storage | Simpler than S3 |
| Charting | Recharts | Cost bars, donuts, cross-filter dashboard |
| Gantt | `frappe-gantt` (editable) or custom React component | Drag-to-reschedule needed |
| AI | Claude Sonnet via Anthropic API + Vercel AI SDK (streaming) | Matches PCS AI Assistant approach |
| Email | Resend via Supabase SMTP | Magic-link + notifications |
| PDF export | `@react-pdf/renderer` (server-side) | Component-driven PDF layout, CME brandable |
| Excel export | `exceljs` (server-side) | Multi-sheet workbooks with formulas and styling |
| CSV export | Built-in Node stream + manual serialization | Simple, no library |
| Hosting | Vercel | Same pipeline as PCS |
| Domain | `cme-client-portal.vercel.app` (default) | DNS cutover to `portal.colemanagement.com` later |

---

## 5. CME brand design system

All tokens from the CME 2019 Style Guide. Load via Tailwind and `next/font`.

### Color tokens
```ts
colors: {
  cme: {
    'bright-green': '#3C9D48',
    'dark-green':   '#25532E',
    'yellow':       '#FFCB0E',
    'gray':         '#C7C8CA',
    'black':        '#000000',
    'red':          '#E85F46',
    'light-brown':  '#9E662C',
    'dark-brown':   '#52361C',
    'lavender':     '#B67AB4',
    'blue':         '#4B5F9E',
    'purple':       '#9E3B58',
  }
}
```

### Typography
- **Headings:** Bebas Neue Pro Bold (requires license) — use Oswald as temporary Google Fonts substitute
- **Body:** Raleway

### Status badge colors
- Not Started → gray
- In Development → yellow
- Submitted for Review → blue
- Accepted → bright-green
- Rejected → red
- Deferred → dark-brown

### Component patterns
- Triangular CME letterhead shapes (SVG components) on landing and exported PDFs
- Primary CTA: yellow bg, black text
- Secondary CTA: bright-green bg, white text
- Destructive: red

---

## 6. Database schema

### Project tables
**projects** — `id, name, client_name, client_short, slug, baseline_year, kickoff_on, status, started_on, target_complete_on, total_hours_baseline, total_cost_baseline, description, created_at, updated_at`

**project_members** — `id, project_id, user_id, role, invited_by, invited_at, accepted_at`

**users** — `id (matches auth.users.id), full_name, firm, avatar_url, role (global), created_at`

### Workplan tables
**workplan_tasks** — `id, project_id, wbs, parent_wbs, task_name, phase, start_date, finish_date, notes, status, status_updated_at, status_updated_by, is_milestone, is_published, sort_order, created_at, created_by, updated_at, updated_by`

Total hours/cost computed from resources, not stored.

**workplan_task_resources** — `id, task_id, resource_id, hours, cost_override (nullable), notes`

**resources** — `id, full_name, firm, b7_classification, role_description, avatar_url, is_active, created_at`

**resource_rate_history** (date-effective loaded rates) — `id, resource_id, effective_from, effective_to (nullable), rate_loaded, rate_source, notes, created_at, created_by`

Seed with B7 R26-003 2026 rates. Portal auto-generates 3% compound rows for each calendar year through project end + 1. Any row overridable.

### Deliverables + narrative
**deliverables** — `id, project_id, ref_code, title, description, wbs_links (text[]), due_date, status, evidence_url, notes, sort_order, created_at, updated_at`

**narrative_sections** — `id, project_id, section_key, title, body_markdown, sort_order, is_published, version, created_at, updated_at`

### Change management
**proposed_changes** — `id, project_id, operation ('create'|'update'|'delete'), entity_type, entity_id (nullable), change_data (jsonb), status ('draft'|'submitted'|'accepted'|'rejected'|'withdrawn'|'applied'), submission_id (nullable), proposed_by, proposed_at, via_ai, ai_conversation_id (nullable), reviewed_by, reviewed_at, review_note, applied_at`

**change_submissions** — `id, project_id, submitter_id, submitted_at, submitter_note, status ('pending_review'|'accepted'|'rejected'|'mixed'|'withdrawn'), reviewer_id, reviewed_at, reviewer_note`

### Snapshots (NEW — supports exports and version history)
**workplan_snapshots** — `id, project_id, snapshot_type ('submission'|'accepted_version'|'manual'), snapshot_label, version_number (auto-incr per project per type), captured_at, captured_by, submission_id (nullable fk), data (jsonb), narrative_data (jsonb), notes`

- `submission` snapshots — auto-captured on `change_submissions` creation; frozen copy of workplan + proposed changes in that submission
- `accepted_version` snapshots — auto-captured when a submission is accepted; becomes the new canonical baseline
- `manual` snapshots — CME Admin captures ad-hoc (e.g., "Baseline for ACTC December review")
- `data` payload is a denormalized JSON of all workplan_tasks + workplan_task_resources + milestones as they were at snapshot time
- `narrative_data` payload is all narrative_sections at snapshot time
- Snapshots are immutable; edits to "a version" create a new snapshot, never mutate existing

### AI assistant
**ai_conversations** — `id, project_id, user_id, title, created_at, last_message_at`

**ai_messages** — `id, conversation_id, role, content, tool_name (nullable), tool_args (jsonb), tool_result (jsonb), created_at`

### Operational
**comments** — `id, project_id, entity_type, entity_id, parent_comment_id, author_id, body_markdown, mentions (uuid[]), created_at, updated_at, resolved_at, resolved_by`

**documents** — `id, project_id, title, description, storage_path, file_size, mime_type, version, uploaded_by, uploaded_at, supersedes_id`

**audit_log** — `id, project_id, actor_id, action, entity_type, entity_id, payload (jsonb), ip_address, user_agent, created_at`

**notifications** — `id, user_id, project_id, kind, entity_type, entity_id, seen_at, created_at`

---

## 7. Rate escalation engine

### Escalation rule
Rates escalate **3% on January 1 of each calendar year** after the baseline year. Baseline year per-project (`projects.baseline_year`). PCS default: 2026.

### Storage
Each resource has one `resource_rate_history` row per calendar year. Seed script pre-generates rows through project end year + 1. Example for Chris Cole:
```
2026-01-01 → 2026-12-31   $407.04   "B7 R26-003 2026"
2027-01-01 → 2027-12-31   $419.25   "Calendar 2027 +3%"
2028-01-01 → 2028-12-31   $431.83   "Calendar 2028 +3%"
```

### Cost calculation
For each `workplan_task_resource` with `start_date`, `finish_date`, `hours`:
1. Split task date range by rate-effective periods
2. For each period: `period_hours = hours × (days_in_period / total_task_days)`
3. `period_cost = period_hours × rate_for_period`
4. `task_resource_cost = Σ period_cost`

Server utility `computeCostForTaskResource(taskResource)` encapsulates. UI calls live on change. Persisted on save, always recomputable.

### Cost display
- Task row shows computed total
- Task detail drawer shows breakdown by rate period
- Monthly dashboard accounts for rate boundaries automatically

---

## 8. Submit / review workflow

### Draft state
CME Viewer or ACTC user editing creates `proposed_changes` with `status='draft'`, `submission_id=NULL`. Drafts visible only to creator + CME Admins. Persistent **Drafts (n)** badge.

### Submit action
1. Open Drafts tray, review bundled drafts
2. Optionally remove or edit individual drafts
3. Add submission note
4. Click **Submit for Review**
5. System creates `change_submissions` record; drafts flip to `status='submitted'` with submission_id
6. **Snapshot automatically captured** in `workplan_snapshots` (type='submission')
7. CME Admins notified
8. Submitter sees submission in "Your Submissions" with status

### Review action
1. CME Admin opens Review Queue
2. Submissions listed with submitter/date/note/change count
3. Admin actions:
   - **Accept all** → all changes applied; submission status=accepted; **new `accepted_version` snapshot captured** (becomes new canonical baseline)
   - **Reject all** → required reason; submission status=rejected
   - **Review per-change** → each accepted/rejected individually; submission status=mixed; partially-accepted changes still trigger new accepted_version snapshot
4. Accepted changes write to canonical; `applied_at` set; audit_log entries created
5. Submitter notified with outcome

### Direct edits by CME Admin
Writes canonical; audit_log entry; no proposed_change; no auto-snapshot (Admin can create manual snapshot when appropriate).

### AI-authored changes
AI proposes via tool call → creates `draft` proposed_change attributed to user with `via_ai=true` + `ai_conversation_id`. User still has to hit Submit.

---

## 9. AI assistant

### What it does
Sidebar chat. Claude Sonnet via Anthropic API, streaming via Vercel AI SDK. Answers questions and proposes changes — never mutates data directly.

### Tools exposed
- `query_workplan(filters)` — tasks by phase/status/resource/date/firm/milestone
- `query_costs(dimension, filters)` — grouped costs (firm/resource/phase/month)
- `query_deliverables(filters)` — deliverables by status/due/wbs
- `search_narrative(query)` — retrieval over narrative_sections
- `query_rate_history(resource_id)` — rate timeline
- `propose_task_update(task_id, field, new_value, reason)` — create draft
- `propose_new_task(payload)` — operation=create draft
- `propose_delete_task(task_id, reason)` — operation=delete draft
- `propose_milestone(payload)` — shortcut

Confirmation in chat: *"Proposed 1 change — check your Drafts"*.

### Knowledge base
MVP reads narrative + workplan via tools (no vector search). Add pgvector later.

### Cost envelope
~$30–80/month for ~30 users.

### UI placement
Collapsible sidebar strip (40px → 400px expanded). Pop-out to independent window. Per-user conversation history.

### Safety
- RLS enforced inside every tool
- No cross-project reads
- All tool calls logged in `ai_messages`

---

## 10. Cross-filter dashboard (portfolio summary)

Panel at the top of the Timeline page. Four Recharts `BarChart` components:

1. **By Firm** — CME, DAVTEQ, SQL & Sightline, ACUMEN, Tricertus
2. **By User** — all assigned resources
3. **By Phase** — Phase 1 / 1.5 / 2 / 3 / PM
4. **By Month** — horizontal bars per month May 2026 – Apr 2027, stacked by phase

### Interaction
- Click a bar → filter pill appears
- Multiple bars → AND composition
- Click pill ✕ or "Clear all" → reset
- Filter state URL-encoded for shareable views (`?firm=CME&month=2026-08`)

Gantt and downstream tables re-render filtered. Month aggregation uses rate engine for accurate monthly $.

---

## 11. Editable Gantt behavior

### Features
- Horizontal timeline, WBS-grouped
- Milestones as diamonds
- Today-line yellow
- Click → detail drawer
- Hover → tooltip (hours, resources, cost breakdown)
- Drag edge → resize finish
- Drag body → shift start + finish
- Cross rate-year boundary → cost auto-recalculates

### Edit permissions
- **CME Admin:** Drag commits immediately; confirm modal on drops >2 weeks
- **CME Viewer + ACTC:** Drag creates draft; bar renders yellow until submitted

### Mobile
Vertical timeline list. Tap → drawer with date pickers. No drag on mobile.

---

## 12. Exports (PDF, Excel, CSV)

### What's exportable
1. **Current draft view** — the canonical workplan with your pending drafts overlaid
2. **A specific submission** — frozen bundle of what you (or someone whose submission you can see) submitted
3. **Accepted baseline (canonical)** — the current official workplan
4. **A historical accepted version** — any prior accepted snapshot
5. **Narrative / status report** — the current narrative_sections rendered as a PDF

### Who can export what
- **Own drafts** — only the creator
- **Submissions** — CME Admins + CME Viewers see all; ACTC users see only their own submissions
- **Accepted versions** — everyone in the project can export the canonical baseline and all accepted historical versions
- **Narrative** — current version exportable by all; historical narrative versions exportable by CME only

### PDF layout (CME-branded)
- Cover page: CME logo, letterhead shapes, project name, version label ("Submission #12 by S. Jones — Aug 15, 2026"), snapshot date, CME contact
- Executive summary (auto-generated from narrative intro + metadata)
- Workplan table — grouped by phase, with WBS, task name, dates, resource, hours, rate year, rate, cost, status, notes
- Milestones page — diamond icons, dates, descriptions
- Cost summary — totals by firm, user, phase, with rate escalation breakdown
- Version metadata — who captured, when, what changed from prior version
- Footer on every page: project name | version | page N of M
- Fonts: Bebas/Oswald headings, Raleway body

### Excel layout
Multi-sheet workbook, CME-branded (dark-green headers, yellow milestone highlights):
- **Summary** — project metadata, totals, version info
- **Workplan** — full task list with Status column (matches v8 structure), formulas preserved for downstream editing
- **Milestones** — milestone rows with ★ indicator
- **Resources** — resource list with role, firm, current rate
- **Rate History** — full date-effective rate table (important for audit)
- **Cost Analysis** — pivots by firm/user/phase/month with escalation applied

### CSV layout
Single flat file, one row per task-resource assignment:
```
wbs, task_name, phase, start_date, finish_date, resource_name, firm, rate_year, rate, hours, cost, status, notes
```

### API endpoints
```
GET /api/export/workplan/draft?format=pdf|xlsx|csv
GET /api/export/workplan/canonical?format=pdf|xlsx|csv
GET /api/export/workplan/submission/:id?format=pdf|xlsx|csv
GET /api/export/workplan/version/:id?format=pdf|xlsx|csv
GET /api/export/narrative?format=pdf
```

All endpoints enforce visibility rules from Section 3 + Section 12.
All exports are logged in `audit_log` (`action='export.generate'`, payload includes scope, format, requester).

### Download UX
Every screen showing workplan data has a Download button (top right, shadcn `DropdownMenu`):
- "Download my draft" → format picker → file download
- "Download canonical" → format picker → file download
- "Download submission..." → list of visible submissions → format picker → file download
- "Download version..." → list of accepted versions → format picker → file download

Submissions page has a per-row Download button for each submission the user can see.

---

## 13. Screen inventory

| Screen | Route | Roles | Key elements |
|--------|-------|-------|--------------|
| Login | `/login` | anon | CME letterhead, email + Google sign-in |
| Invite accept | `/invite/:token` | anon | Token validation, account creation |
| Portal home | `/` | all | Accessible projects list |
| Overview | `/p/:slug` | all | Narrative, team, quick stats, Download button |
| Timeline | `/p/:slug/timeline` | all | Cross-filter bars + editable Gantt, Download button |
| Deliverables | `/p/:slug/deliverables` | all | 45-row table, status editor |
| Costs | `/p/:slug/costs` | all | Cost by firm/user/phase/month w/ escalation |
| Activity | `/p/:slug/activity` | all | Comments + change events |
| Drafts | `/p/:slug/drafts` | viewer+ | Pending drafts, Submit action, Download button |
| Submissions | `/p/:slug/submissions` | all | Visible submissions with per-row Download |
| Versions | `/p/:slug/versions` | all | All accepted snapshots, per-row Download |
| Review queue | `/p/:slug/review` | CME Admin | Pending submissions, accept/reject |
| Documents | `/p/:slug/documents` | all | Upload + versioned download |
| AI Assistant | sidebar, all pages | all | Chat panel, pop-out |
| Admin | `/admin` | CME Admin | Users, projects, rates, audit log |

---

## 14. Seed data plan

| Content | Source | Target |
|---------|--------|--------|
| Project (ACTC PCS) | Manual insert w/ kickoff_on=2026-05-01 | `projects` |
| Resources | v7 Resource Summary | `resources` |
| Rate history | B7 R26-003 2026 + 3% compound forward | `resource_rate_history` |
| Workplan tasks | `ACTC_PCS_Workplan_v8.xlsx` (all Not Started) | `workplan_tasks` + `workplan_task_resources` |
| Deliverables | Contract Deliverables (rA1) | `deliverables` |
| Narrative | `PCS_Status_Narrative.md` | `narrative_sections` |
| Initial baseline snapshot | Auto-captured after seed | `workplan_snapshots` (type='accepted_version', label='v8 Baseline Apr 19 2026') |

One-time `/scripts/seed-from-workplan.ts` run via `npx tsx`.

---

## 15. Build sequence (7 sessions)

1. **Scaffold + CME design system** — Done in `cme_portal_claude_code_kickoff.md`.
2. **Schema + auth + admin skeleton** — All 15 tables (includes `workplan_snapshots`), RLS, triggers, magic-link + Google auth, invite flow.
3. **Seed + rate engine** — Importer, rate utility + tests, initial baseline snapshot captured, basic list views.
4. **Overview + editable Gantt** — Narrative, drag-editable Gantt, detail drawer, draft creation.
5. **Deliverables + cost dashboard + cross-filter bars** — Deliverables table, 4 bar charts with filters, filtered Gantt.
6. **Drafts + submissions + review queue + exports + comments + documents** — Complete change workflow, snapshot auto-capture on submit/accept, PDF/Excel/CSV export endpoints + Download UX, threaded comments, document uploads.
7. **AI assistant** — Chat sidebar, streaming, all tools, conversation history, pop-out.

Session 6 is the heaviest session in the plan given exports. If it runs long, pull exports into a Session 6.5.

---

## 16. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
RESEND_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=https://cme-client-portal.vercel.app
CME_ADMIN_EMAILS=chris@colemanagement.com
```

---

## 17. Open decisions

- **Bebas Neue Pro licensing** — confirm or keep Oswald substitute
- **Email provider** — Resend recommended; Postmark alternative
- **Gantt library** — `frappe-gantt` vs custom — decide at Session 4
- **AI model** — Claude Sonnet default; Opus 4.7 for complex queries if budget allows
- **Conflict resolution on drafts** — same-field contention handled at accept time (Session 6)
- **PDF page size** — US Letter default; can expose option in admin settings later
- **Snapshot retention** — all snapshots retained indefinitely in MVP; may need archival policy later

---

## 18. Files reference

| File | Purpose |
|------|---------|
| `cme_client_portal_spec.md` | This file |
| `ACTC_PCS_Workplan_v8.xlsx` | Workplan with Status column (all Not Started); seed |
| `PCS_Status_Narrative.md` | Pre-kickoff status narrative; seed |
| `cme_portal_claude_code_kickoff.md` | Session 1 kickoff |
| `cme_portal_claude_code_session2.md` | Session 2 kickoff (with workplan_snapshots) |
| `CME_Style_Guide.pdf` | Brand reference |
| `Artboard_1-10000.png` | CME primary logo |

---

## 19. Version history

- **v1.2 (Apr 19, 2026):** Clarified pre-kickoff state — all workplan lines are Not Started until May 1, 2026 contract kickoff; Claude Code prototype is a CME pre-contract investment, not a contracted deliverable. Added `workplan_snapshots` table for versioning, triggered automatically on submission and acceptance. Added export capabilities: PDF via `@react-pdf/renderer`, Excel via `exceljs`, CSV via built-in. Export scope: current draft / specific submission / canonical baseline / historical version / narrative. Visibility: CME staff + submitter for submissions; everyone in project for accepted baselines. All exports logged in audit_log. Added Versions screen to inventory.
- **v1.1 (Apr 19, 2026):** Corrected status taxonomy (In Development / Submitted / Accepted). Rate escalation engine. Change submissions batching. AI assistant with propose-only tools. Cross-filter dashboard. Editable Gantt. Expanded proposed_changes for create/update/delete.
- **v1.0 (Apr 19, 2026):** Initial spec.
