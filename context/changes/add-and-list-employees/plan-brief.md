# Add and List Employees (with Department Data Foundation) — Plan Brief

> Full plan: `context/changes/add-and-list-employees/plan.md`

## What & Why

Help desk/IT staff currently have no way to record employees or scope that data by department — the schema doesn't exist yet. This plan builds the department-scoped data foundation (roadmap F-01) together with the add-employee + list-employees feature (roadmap S-01), because S-01 can't be planned meaningfully without the data model it depends on, and F-01 has no plan of its own yet.

## Starting Point

Auth (signup/signin/signout, cookie sessions, `PROTECTED_ROUTES` middleware) is fully working, but signup captures only email + password. There is no `departments`/`employees` schema, no `supabase/migrations/`, no `zod` dependency, and no `src/lib/services/` — all documented conventions that don't exist in the repo yet. The app is already deployed with some registered users.

## Desired End State

A help desk/IT user signs up while choosing their department from a required dropdown. Once signed in, they reach `/employees`, add an employee (name, position, phone), and see an alphabetical list of employees — scoped to their own department only, enforced by Postgres row-level security rather than application code. A user in a different department never sees these records, verified by an automated smoke test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Department provisioning | Required dropdown at signup (seeded department list) | No admin UI exists in MVP scope; self-service at signup avoids a manual DB step per new user |
| User↔department link | New `profiles` table (`id` → `auth.users.id`, `department_id` FK) | Standard Supabase pattern, FK-constrained, extensible |
| RLS enforcement | Policies join `profiles` via `auth.uid()` at query time | Single source of truth; department changes take effect immediately, no re-login needed |
| Employee list order | Alphabetical by last name, then first name | Predictable directory-style scanning for IT staff |
| Empty/error UX | Friendly empty state + inline `ServerError` banner | Reuses the existing component, matches auth-form UX conventions |
| Automated testing | Extend `scripts/smoke.mjs` with add+list AND a cross-department isolation check | Directly verifies the PRD's single highest-risk guardrail with a real HTTP test |
| Position field | Free text | No fixed list to maintain; matches the PRD's simple field list |
| Seeded departments | IT, HR, Sales, Finance | Provided directly by the user |
| Department required at signup | Yes, blocking | Guarantees every user has a department; avoids an "incomplete profile" state/gate |
| Pre-existing accounts without a department | One-off manual SQL backfill, documented in README | Likely only a handful of test accounts pre-launch; avoids building an onboarding-gate feature for it |

## Scope

**In scope:**
- `departments`, `profiles`, `employees` tables with granular per-operation RLS
- Auth trigger creating a `profiles` row from signup metadata
- Required department dropdown on signup
- `/api/employees` (GET list, POST create), zod-validated, RLS-scoped
- `/employees` page: alphabetical employee list + add form
- Smoke test coverage for add/list and cross-department isolation

**Out of scope:**
- Edit/delete employees (S-02), department logo (S-03), script generation/emailing (S-04/S-05)
- Any department create/rename/delete UI
- Cross-department admin role, AD/HR import, strict phone format enforcement, pagination
- Self-hosted Supabase migration (tracked separately)

## Architecture / Approach

Postgres RLS is the isolation boundary, not application code: every `employees` query is automatically scoped by joining against the caller's `profiles.department_id`. A `SECURITY DEFINER` trigger on `auth.users` creates the `profiles` row atomically at signup, reading `department_id` from the metadata the signup route passes into `supabase.auth.signUp()`. The `/api/employees` route additionally never trusts a client-supplied department id — it's always derived server-side from the caller's own profile, so isolation holds even if RLS were ever misconfigured.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation | departments/profiles/employees schema + RLS + signup trigger + seed | RLS or trigger miswiring silently breaks isolation |
| 2. Signup dept selection | Required department dropdown wired into signup | Trigger/metadata ordering must be correct or profiles end up department-less |
| 3. Service + API | zod, `src/lib/services/employees.ts`, `/api/employees` | Department must never be trusted from client input |
| 4. Employee UI | `/employees` page, add form, nav link | Reasonable UI/UX polish only, low risk |
| 5. Isolation testing | Extended smoke test + backfill doc | Only real automated proof of the isolation guarantee |

**Prerequisites:** None beyond this plan itself — F-01 and S-01 are both delivered here.
**Estimated effort:** ~3-4 sessions across 5 phases, consistent with the project's 3-week after-hours timeline.

## Open Risks & Assumptions

- Signup now collects a department, which is scope beyond S-01's literal FRs (FR-002/FR-003) — accepted explicitly by the user as the only viable provisioning path given no admin UI exists.
- Self-selection at signup means any signer-upper can pick any department; no additional gating (e.g. email-domain restriction) was requested and none is implemented.
- Pre-existing deployed accounts need a manual, per-user backfill before this feature reaches them in production — a real operational step someone must remember to run.

## Success Criteria (Summary)

- A help desk/IT user can add and see employees scoped strictly to their own department, end-to-end through the UI.
- An automated smoke test proves cross-department isolation, not just the happy path.
- `npm run lint`, `npx astro check`, and `npm run build` all pass with no regressions to the existing auth flow.
