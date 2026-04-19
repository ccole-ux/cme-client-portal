# Supabase — CME Client Portal

## Applying migrations

Two options, pick one. Migrations are idempotent per file but **must run in order**.

### Option A — Supabase Dashboard (easiest first run)

1. Open https://supabase.com/dashboard/project/qodxdzgormqtbqiakhxn/sql/new
2. Paste the full contents of `supabase/apply-all.sql`
3. Click **Run**

### Option B — Supabase CLI (recommended once linked)

```bash
npx supabase login
npx supabase link --project-ref qodxdzgormqtbqiakhxn
npx supabase db push
```

## After migrations succeed

Seed your CME Admin account by pasting `scripts/seed-admin.sql` into the SQL
editor (requires your auth user to exist — sign in via magic link once first so
the `handle_new_auth_user` trigger creates your row, then run the seed to flip
your role to `cme_admin`).

## Regenerating types

```bash
npx supabase gen types typescript --project-id qodxdzgormqtbqiakhxn > src/lib/supabase/types.ts
```

## Files

| File                                         | Purpose                                |
|----------------------------------------------|----------------------------------------|
| `migrations/001_users_and_projects.sql`      | users, projects, project_members       |
| `migrations/002_workplan.sql`                | resources, rates, workplan_tasks       |
| `migrations/003_deliverables_narrative.sql`  | deliverables, narrative_sections       |
| `migrations/004_changes.sql`                 | proposed_changes, change_submissions   |
| `migrations/005_snapshots.sql`               | workplan_snapshots                     |
| `migrations/006_ai.sql`                      | ai_conversations, ai_messages          |
| `migrations/007_ops.sql`                     | comments, documents, audit_log, etc.   |
| `migrations/008_rls.sql`                     | RLS helper fns + policies              |
| `migrations/009_triggers.sql`                | updated_at, audit, snapshot versioning |
| `apply-all.sql`                              | Concatenated 001–009 for dashboard use |
