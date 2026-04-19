# CME Client Portal — Claude Code Session 1 Kickoff (v2 — Auto-bootstrap)

**Target:** Scaffold Next.js, establish CME design system, deploy branded landing page.
**New in v2:** Claude Code handles GitHub repo creation and Vercel deployment wiring automatically using authenticated CLIs. You only need to handle the Supabase 2-minute click.
**Expected duration:** 60–90 min (5 min of it is your Supabase click-through).

---

## What you do BEFORE pasting this prompt

Open a browser tab to **https://supabase.com/dashboard** in parallel. You'll need it at step 6 of this session — Claude Code will pause and ask you to create a project and paste the credentials. Keep this tab handy.

Everything else (GitHub repo, Vercel setup) Claude Code handles via CLI.

---

## Copy everything below into a new Claude Code session

---

You are starting the CME Client Portal, Session 1 of 7. Current working directory is `cme-client-portal/` with five reference files loose at the root. Full spec is in `cme_client_portal_spec.md` — read it before writing code.

Session 1 goal: scaffold Next.js in place, establish CME design system, deploy branded landing page to Vercel. That's it.

## Tasks in order

### 1. Move reference docs into `docs/`
```bash
mkdir -p docs
mv cme_client_portal_spec.md docs/ 2>/dev/null || true
mv PCS_Status_Narrative.md docs/ 2>/dev/null || true
mv ACTC_PCS_Workplan_v8.xlsx docs/ 2>/dev/null || true
mv cme_portal_claude_code_session1.md docs/ 2>/dev/null || true
mv cme_portal_claude_code_session2.md docs/ 2>/dev/null || true
```

### 2. Read the spec
`docs/cme_client_portal_spec.md` — read it in full. Sections 5, 13, 15 matter most for this session.

### 3. Verify CLI authentication
Confirm `gh` and `vercel` CLIs are authenticated. If not, stop and ask me to run `gh auth login` or `vercel login`.
```bash
gh auth status
vercel whoami
```
Both should succeed. If either fails, stop and tell me which one.

### 4. Create GitHub repo via `gh` CLI
```bash
gh repo create ccole-ux/cme-client-portal --public --description "CME Client Portal — proposal and project status dashboard for CME clients" --clone=false
```
If the repo already exists, that's fine — proceed.

### 5. Scaffold Next.js IN PLACE
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-turbopack --use-npm
```
Say yes when it asks about non-empty directory. `docs/` stays untouched.

Then:
```bash
npm install @supabase/supabase-js @supabase/ssr lucide-react
```

### 6. ⏸ PAUSE — request Supabase credentials
Stop and tell me:
> "Please create a Supabase project named `cme-client-portal` at https://supabase.com/dashboard. Region: `us-west-1`. Database password: save it somewhere safe. When created, paste here: (a) the Project URL, (b) the anon key (under Settings → API), and (c) the service_role key."

Wait for me to reply with the three values before continuing.

### 7. Wire env vars
Create `.env.local` (gitignored) with the values I provide:
```
NEXT_PUBLIC_SUPABASE_URL=<paste>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<paste>
SUPABASE_SECRET_KEY=<paste>
NEXT_PUBLIC_APP_URL=https://cme-client-portal.vercel.app
```
Create `.env.local.example` (committed) with blank values for the same keys.

### 8. Git initial commit and push
```bash
git init -b main  # if not already
git add .
git commit -m "Session 1: Initial scaffold"
git remote add origin https://github.com/ccole-ux/cme-client-portal.git 2>/dev/null || true
git push -u origin main
```

### 9. CME design tokens (Tailwind)
Update `tailwind.config.ts` per spec section 5 — all 11 CME colors nested under `cme.*`.

### 10. Typography via next/font
- Body: Raleway (400, 500, 600, 700) from `next/font/google`
- Heading: Oswald — TEMPORARY substitute for Bebas Neue Pro Bold which requires a license. Leave `// TODO: swap to Bebas Neue Pro once Chris confirms license` comment.
- Load both in `src/app/layout.tsx`; expose as CSS vars `--font-body`, `--font-heading`
- Extend Tailwind: `fontFamily.sans = ['var(--font-body)']`, `fontFamily.display = ['var(--font-heading)']`

### 11. Logo + brand components
- `public/logos/README.md` — "Chris will upload `cme-logo-primary.png` here (the Artboard_1-10000.png asset)"
- `src/components/brand/LogoMark.tsx` — inline SVG placeholder: CME green triangle
- `src/components/brand/LetterheadTop.tsx` — SVG: overlapping dark-green and bright-green triangular shapes (from CME Style Guide page 3 pattern)
- `src/components/brand/LetterheadBottom.tsx` — mirrored version

### 12. Branded landing page
`src/app/page.tsx`:
- `<LetterheadTop />`
- Centered hero:
  - `<LogoMark />`
  - H1 "CME CLIENT PORTAL" — `font-display text-cme-dark-green tracking-wider text-5xl`
  - Subheading "PROJECT MANAGEMENT · ENGINEERING · CLIENT COLLABORATION"
  - Body "Coming soon — check back with your invitation link"
- `<LetterheadBottom />`
- No auth calls, no data fetching. Just branded static page.

### 13. Supabase client wiring
- `src/lib/supabase/client.ts` — browser client via `createBrowserClient` from `@supabase/ssr`
- `src/lib/supabase/server.ts` — server client via `createServerClient` from `@supabase/ssr`

Don't actually call Supabase on the landing page — just wire the clients for Session 2.

### 14. Commit and push
```bash
git add .
git commit -m "Session 1: CME design system + landing page"
git push
```

### 15. Deploy to Vercel via CLI
```bash
vercel link --yes --project cme-client-portal
```
If the project doesn't exist yet:
```bash
vercel project add cme-client-portal
vercel link --yes --project cme-client-portal
```

Add env vars:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel env add NEXT_PUBLIC_APP_URL production
```
(Paste the values when prompted.)

Deploy:
```bash
vercel --prod --yes
```

Connect GitHub for auto-deploys on push:
```bash
vercel git connect https://github.com/ccole-ux/cme-client-portal
```

### 16. Final report
Once deployed, report back with:
- Live Vercel URL
- Confirmation the branded landing page renders correctly
- Any env vars or settings that still need attention

## Out of scope for Session 1
Auth (Session 2), schema/migrations (Session 2), seed data + rate engine (Session 3), Gantt/dashboards (Sessions 4–5), submissions/review/exports/comments/documents (Session 6), AI assistant (Session 7).

## Conventions
- TypeScript strict mode on
- Prefer server components; `'use client'` only where needed
- Tailwind utility classes only
- Lucide for icons
- No animation libs this session
- No shadcn/ui this session — Session 2 adds it
