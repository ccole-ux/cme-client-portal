# CME Client Portal — Claude Code Session 2 Kickoff

**Target:** Build the full database schema (including `workplan_snapshots`), RLS policies, magic-link + Google auth, invite flow, and admin skeleton pages.
**Expected duration:** 60–90 minutes of Claude Code time.
**Prerequisites:**
- Session 1 deployed (branded landing page at `cme-client-portal.vercel.app`)
- `docs/cme_client_portal_spec.md` v1.2 in the repo
- Supabase project `cme-client-portal` created with URL + keys in `.env.local`
- Resend account created, API key in `.env.local` as `RESEND_API_KEY`
- Anthropic API key saved for Session 7 (`ANTHROPIC_API_KEY` in `.env.local`)

---

## Copy everything below into a new Claude Code session

---

You are continuing the CME Client Portal at `cme-client-portal.vercel.app`. Session 1 (scaffold + design system) is deployed. This is Session 2 of 7.

Read `docs/cme_client_portal_spec.md` v1.2 before starting. Sections 2, 3, 6, 8, 12 are most relevant for this session.

## Session 2 scope

Build everything needed for a user to sign in, be invited into a project, and land on an admin or viewer home page. No workplan data yet — that's Session 3. Exports are Session 6 but the supporting `workplan_snapshots` table must be created now so Session 3's importer can capture an initial baseline.

## Tasks in order

### 1. Install dependencies
```bash
npm install @tanstack/react-query zod react-hook-form @hookform/resolvers
npm install date-fns
npm install resend
npx shadcn@latest init   # answer: New York style, slate base color, CSS variables yes
npx shadcn@latest add button card input label dialog badge dropdown-menu separator sonner table tabs form
```

Update shadcn theme CSS variables to use CME colors: `--primary: #25532E` (dark green), `--accent: #3C9D48` (bright green), `--warning: #FFCB0E` (yellow), `--destructive: #E85F46` (red). Keep shadcn's structural CSS but override color tokens.

### 2. Supabase schema migrations
Create `/supabase/migrations/`. Write ONE migration file per logical group:

- `001_users_and_projects.sql` — `users`, `projects`, `project_members`
- `002_workplan.sql` — `resources`, `resource_rate_history`, `workplan_tasks`, `workplan_task_resources`
- `003_deliverables_narrative.sql` — `deliverables`, `narrative_sections`
- `004_changes.sql` — `proposed_changes`, `change_submissions`
- `005_snapshots.sql` — `workplan_snapshots` (new; see spec section 6)
- `006_ai.sql` — `ai_conversations`, `ai_messages`
- `007_ops.sql` — `comments`, `documents`, `audit_log`, `notifications`
- `008_rls.sql` — All RLS policies in one file for readability
- `009_triggers.sql` — `set_updated_at()`, `audit_log_trigger()`, applied to every table needing them

Follow spec section 6 column specifications exactly. Use `uuid` primary keys (`gen_random_uuid()`), `timestamptz` timestamps, `jsonb` for JSON payloads.

**workplan_snapshots table** (per spec 6 + spec 12):
```sql
CREATE TABLE workplan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('submission', 'accepted_version', 'manual')),
  snapshot_label text,
  version_number integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid NOT NULL REFERENCES users(id),
  submission_id uuid REFERENCES change_submissions(id),
  data jsonb NOT NULL,
  narrative_data jsonb,
  notes text,
  UNIQUE (project_id, snapshot_type, version_number)
);
CREATE INDEX idx_snapshots_project_type ON workplan_snapshots(project_id, snapshot_type);
CREATE INDEX idx_snapshots_submission ON workplan_snapshots(submission_id);
```

Add a trigger `auto_increment_snapshot_version()` that sets `version_number = coalesce(max(version_number),0) + 1` for the `(project_id, snapshot_type)` pair on insert.

### 3. RLS policies
Per spec section 3 role matrix and section 12 export visibility rules. Key helpers and policies:

Helper functions:
```sql
CREATE FUNCTION is_cme_admin() RETURNS boolean ...
CREATE FUNCTION is_cme_viewer() RETURNS boolean ...
CREATE FUNCTION is_cme_staff() RETURNS boolean -- admin OR viewer
CREATE FUNCTION is_project_member(p_project_id uuid) RETURNS boolean ...
```

Policy summary:
- `users` — readable if self OR is_cme_staff()
- `projects` — readable if is_cme_staff() OR is_project_member(id)
- `project_members` — same read scope; write only is_cme_admin()
- `workplan_tasks`, `deliverables`, `narrative_sections` — readable per project; filter `is_published=true` unless is_cme_staff(); write only is_cme_admin() (direct-edit path) — all other writes go through `proposed_changes`
- `proposed_changes` — readable by proposer + is_cme_staff(); writable by anyone in the project (for their own drafts)
- `change_submissions` — readable by submitter + is_cme_staff(); writable by submitter
- `workplan_snapshots` — **visibility differs by type**:
  - `submission` snapshots: readable by submission's submitter + is_cme_staff() only
  - `accepted_version` snapshots: readable by any project member
  - `manual` snapshots: readable by any project member
- `ai_conversations`, `ai_messages` — readable by owner + is_cme_admin()
- `comments` — readable per project; writable by everyone; update/delete only by author
- `documents` — readable per project; write by is_cme_staff()
- `audit_log` — readable by is_cme_admin(); no DML allowed (triggers write)
- `notifications` — readable by recipient only

Use `auth.uid()` for current-user checks.

### 4. Triggers
- **`set_updated_at()`** — BEFORE UPDATE on every table with `updated_at` column
- **`audit_log_trigger()`** — AFTER INSERT/UPDATE/DELETE on: `workplan_tasks`, `workplan_task_resources`, `deliverables`, `narrative_sections`, `resource_rate_history`, `proposed_changes`, `change_submissions`, `workplan_snapshots`, `project_members`. Capture old/new JSONB in `audit_log.payload`.
- **`auto_increment_snapshot_version()`** — BEFORE INSERT on `workplan_snapshots`.

### 5. Auth — magic link + Google
Supabase Auth providers:
- Email (magic link), 60-minute link expiry
- Google OAuth — Chris provides client ID + secret

Routes:
- `src/app/login/page.tsx` — email input + "Send magic link" + "Sign in with Google"; call `signInWithOtp({ email })` or `signInWithOAuth({ provider: 'google' })`
- `src/app/auth/callback/route.ts` — handle both OTP and OAuth callback, exchange code for session, redirect to `/`
- `src/middleware.ts` — protect all routes except `/login`, `/invite/:token`, `/auth/callback`

### 6. Invite flow
CME Admin only.
- `src/app/admin/users/page.tsx` — users table + "Invite User" button opens modal
- Modal fields: email, role, project (optional)
- Submit calls `src/app/api/admin/invite/route.ts`:
  1. Creates pending invite record
  2. Sends magic-link email via Supabase Auth with `options.emailRedirectTo: ${APP_URL}/invite/${token}`
- `src/app/invite/[token]/page.tsx` — token validation after OAuth; claims the invite, attaches user to project, redirects to `/p/:slug` or `/`

Use Resend for transactional templates — CME-branded HTML (green header, logo, clean styling).

### 7. Home + admin shell
- `src/app/page.tsx` — authenticated home; CME sees project list, client sees theirs; shadcn `Card` components, CME branding
- `src/app/admin/page.tsx` — admin landing with cards linking to Users / Projects / Rates / Snapshots / Audit Log; CME Admin only (middleware)
- `src/app/admin/users/page.tsx` — scaffolded in Step 6
- `src/app/admin/projects/page.tsx` — list + "Create Project" button (wire in Session 3)
- `src/app/admin/rates/page.tsx` — placeholder for Session 3
- `src/app/admin/snapshots/page.tsx` — placeholder for Session 6 (listing + manual capture)
- `src/app/admin/audit/page.tsx` — paginated audit_log table, filter by actor and action

### 8. App shell layout
`src/app/(app)/layout.tsx` wraps authenticated pages:
- Left sidebar: CME logo top, nav (Home, Admin if CME Admin, AI Assistant placeholder), user avatar + sign-out
- Main content area with comfortable max-width
- CME colors: dark-green sidebar, white main, subtle separators

### 9. Type safety
Run `npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/supabase/types.ts` and commit. Add `Database` helper export.

### 10. Commit + deploy
Commit after each logical block. Final commit: `Session 2: Schema (incl. snapshots) + RLS + auth + admin skeleton`. Confirm deploy at `cme-client-portal.vercel.app`.

## Out of scope for Session 2
- Workplan data + importer (Session 3)
- Rate escalation utility (Session 3)
- Gantt, cost dashboards (Sessions 4–5)
- Drafts / submissions / AI / exports (Sessions 6–7)

## Ask me for the following before starting
- Google OAuth client ID and secret
- Resend API key
- Supabase service role key
- Confirm my email (`chris@colemanagement.com`) is seeded as first CME Admin

## Seed a single CME Admin user
After migrations run, INSERT into `users` with role='cme_admin' for Chris's email. Document in `/scripts/seed-admin.sql`.

## Smoke test before closing session
- `/login` shows branded login
- Enter Chris's email → receive magic link → click → land on `/`
- `/admin` shows five admin cards including Snapshots placeholder
- `/admin/users` shows Chris in table
- Navigate as a non-admin Google user → access denied on `/admin`
- Run `INSERT INTO workplan_snapshots ... VALUES ('manual', 1, ...)` manually to confirm schema + trigger

Report back with live URL, screenshots (or detailed descriptions), and any configuration still needed.
