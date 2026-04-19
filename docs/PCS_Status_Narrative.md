# PCS SaaS Replacement — Program Status Narrative

**Prepared by:** Chris Cole, Cole Management & Engineering (CME)
**Date:** April 19, 2026
**Client:** Alameda County Transportation Commission
**Contract reference:** B7 Fixed Hourly Rate Schedule (R26-003)
**Contract kickoff:** May 1, 2026

---

## Status taxonomy

Throughout this narrative and the accompanying v8 workplan:

- **Not Started** — Planned per workplan; work has not yet begun under the contract.
- **In Development** — Work is actively underway under the contract after May 1, 2026.
- **Submitted for Review** — Formally submitted to ACTC for review.
- **Accepted** — ACTC has formally accepted.
- **Rejected** — ACTC reviewed and explicitly rejected.
- **Deferred** — Descoped or postponed.

**As of April 19, 2026, every workplan line is `Not Started`.** The contract has not yet kicked off. No hours have been consumed. No deliverables have been produced under contract. The full $1,356,256 budget is available for the 4,912 hours of contracted work beginning May 1, 2026.

---

## Executive summary

The CME team has invested independently in a **pre-contract exploratory prototype** to de-risk the Phase 1 build and validate architectural decisions before formal contract kickoff. The prototype, accessible at `actc-pcs.vercel.app`, demonstrates working implementations of authentication, the database foundation, core module UIs (Programming, Projects, Contracts, Invoices, Funding), the workflow engine, and an AI assistant.

**This prototype is not a contract deliverable and does not consume workplan hours.** It exists to reduce schedule risk, surface design questions early, and give ACTC stakeholders something tangible to interact with during the closing weeks of the planning phase. When the contract begins on May 1, 2026, the prototype becomes a starting reference that the full contracted team — Nassayan, Nipper, Salzwedel, Chang, Lee, Brown, Mortazavi, and Cole — will systematically review, refine, test, document, and move through formal acceptance under the v8 workplan.

**Contract status as of April 19, 2026:**

| Metric | Value |
|--------|------:|
| Contract kickoff | May 1, 2026 |
| Workplan total | 4,912 hours |
| Budget baseline | $1,356,256 |
| Hours consumed | 0 |
| Items Not Started | 211 of 211 (100%) |
| Items In Development | 0 |
| Items Accepted | 0 |

---

## Scope summary

The v8 workplan plans 4,912 hours across four phases plus ongoing project management over twelve months.

### Phase 1 — Core MVP (May 1 – Nov 6, 2026) — 3,656 hrs / $1,002,734

- **1.0 Database Learning & Data Dictionary** (160 hrs) — Nassayan + Cole map 426 legacy tables, 184 views, 61 AccuFund sync objects into a formal data dictionary that feeds schema and cleanup plans.
- **1.1 Infrastructure** (384 hrs) — Supabase schema, RLS, audit triggers, auth, workflow engine, notifications, home dashboard, BigQuery sync, compliance review.
- **1.2–1.6 Core Modules** (~960 hrs) — Programming, Projects, Contracts, Invoices (including AI Intake), Funding. Each module includes data model, UI, workflows, documentation, compliance review, and dedicated testing by Tricertus.
- **1.11 Data Review & Cleanup** (400 hrs) — Nipper, Salzwedel, Chang, Lee systematically review legacy PCS data across four domains, gating the second migration dry run.
- **1.7 Data Migration** (208 hrs) — Migration scripts SQL Server → Supabase, two dry runs, validation.
- **1.8 Cross-cutting Features** (216 hrs) — AI Assistant, tooltips/PMI terminology/training/org chart, print/export.
- **1.9 Tableau & BigQuery Reporting** (312 hrs) — BigQuery views, Tableau Cloud connection, internal dashboards, post-cleanup validation, Susan's Reporting Template.
- **1.10 UAT & Go-Live Prep** (156 hrs) — Acceptance testing by the primary PCA user, bug fixes, readiness signoff.

Phase 1 culminates in **M5 Phase 1 MVP Go-Live on October 30, 2026** and parallel operation with the legacy system.

### Phase 1.5 — AI Data Access (Nov 2026) — 164 hrs / $44,258
Build-out of `query_pcs_data` tool templates, AI Invoice Intake rule expansion, knowledge base admin.

### Phase 2 — Extended Modules (Dec 2026 – Feb 2027) — 592 hrs / $163,340
Requisitions/procurement workflow, Contract Equity/Insurance/Staffing, PM Update module with .mpp import/export, cloud document storage, AccuFund integration, advanced reporting, AI voice I/O, public-facing Tableau visualizations.

Phase 2 work is performed in **calendar year 2027 and is subject to 3% rate escalation** per standard practice. Actual invoiced amounts calculated by the CME Client Portal using date-effective rates.

### Phase 3 — Optimization (Mar – Apr 2027) — 340 hrs / $92,374
Full AccuFund bidirectional sync, advanced workflows, performance optimization, Tableau polish, production cutover, final compliance signoff.

Phase 3 culminates in **M8 Production Cutover on April 30, 2027**.

### Project Management — 160 hrs / $53,550 ongoing
Cole (oversight and stakeholder coordination), Mortazavi (technical architecture reviews), Salzwedel (ACTC coordination), Nipper (risk management and change control) running across the full twelve months.

---

## What the pre-contract prototype demonstrates

Items visible at `actc-pcs.vercel.app`, all as pre-contract CME exploration:

- Next.js + TypeScript application deployed to Vercel
- Supabase PostgreSQL with 78 tables exercising the draft data model
- RLS policies and audit-trigger patterns
- Google OAuth authentication working end-to-end
- Workflow engine with data-driven workflow definitions
- Prototype UIs for Programming, Projects, Contracts, Invoices, Funding
- AI Assistant chat sidebar
- Home dashboard with work queue
- Org chart, Training Center, Admin Settings screens

**The purpose of showing this to ACTC now** is three-fold: to de-risk the schedule before kickoff, to enable productive terminology and UX conversations with real screens in front of stakeholders, and to surface data model refinements early. The prototype does not replace the contracted work; it precedes it.

When the contract begins May 1, every item in the prototype must move through the formal path: database learning and data dictionary, structured refinement under the contracted schedule, formal testing by Tricertus, data cleanup with ACTC records, compliance reviews by Salzwedel, documentation by Nipper, UAT with the PCA, and final acceptance recorded by ACTC. That path is what the 4,912 contracted hours deliver.

---

## Rate escalation for 2027 work

Fully-loaded billing rates escalate **3% on January 1** of each calendar year. For the PCS program:

| Period | Rate basis |
|--------|-----------|
| Calendar 2026 work (May 1 – Dec 31, 2026) | B7 R26-003 2026 rates |
| Calendar 2027 work (Jan 1 – Apr 30, 2027) | 2026 rates × 1.03 |

Tasks that span the calendar boundary (e.g., Project Management running May 2026 – April 2027) are prorated by calendar day. The CME Client Portal applies this escalation automatically in all cost displays and in exported invoices and reports. The v8 workplan baseline retains 2026 rates for contract clarity; actual invoiced amounts for 2027 work are calculated using escalated rates.

---

## Risks and watch items

- **Data cleanup volume.** v8 assumes 400 hours (moderate). Initial database learning could surface more issues, scaling cleanup to 600–700 hours.
- **IT engagement for legacy SQL Server access.** Migration requires a read-only login to ACTCSQL02. Requesting engagement soon keeps migration on schedule.
- **Microsoft OAuth configuration.** Prototype has Google OAuth working; Microsoft requires ACTC IT tenant configuration before the contracted auth work completes.
- **Susan's Reporting Template.** Placeholder in 1.9.4; needs template or spec from ACTC.
- **Acceptance cadence.** Agreeing how ACTC performs acceptance reviews — per-module rolling, milestone-gated batches, or final big-bang — before kickoff helps plan the Submitted-for-Review lifecycle.
- **Font licensing for CME Client Portal** (separate item, not PCS) — confirm Bebas Neue Pro license or ship Oswald as substitute.

---

## Closing

The CME team is positioned to begin May 1, 2026 with a head start others would not have: a working prototype, a validated data model direction, and a team that has already been hands-on with the technical stack. None of that head start is counted against the contracted hours. What the contract delivers is the disciplined path from prototype to production system — data cleanup, migration, testing, documentation, compliance review, and formal acceptance — that earns the public's trust in a system handling $4B of transportation funding.

As of April 19, 2026: zero workplan hours consumed, zero deliverables submitted, zero items accepted. Ready to begin.
