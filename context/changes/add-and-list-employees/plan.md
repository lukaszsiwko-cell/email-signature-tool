# Add and List Employees (with Department-Scoped Data Foundation) Implementation Plan

## Overview

This plan combines roadmap items **F-01 (department-scoped-data-foundation)** and **S-01 (add-and-list-employees)** into a single change, because S-01 cannot be meaningfully planned or built without the data model and RLS isolation it depends on, and F-01 has no separate plan yet. It implements: a `departments`/`profiles`/`employees` schema with row-level security; a required department selector added to signup; and the add-employee + view-own-department-employee-list feature (FR-002, FR-003 view portion, US-01).

## Current State Analysis

- No `departments`/`employees` schema exists. `supabase/config.toml` is scaffolded (migrations and seed enabled) but `supabase/migrations/` and `supabase/seed.sql` don't exist yet.
- Auth is fully wired end-to-end: `src/middleware.ts` resolves `context.locals.user` via `src/lib/supabase.ts` (cookie-based Supabase SSR client) and gates `PROTECTED_ROUTES = ["/dashboard"]`.
- Signup (`src/pages/api/auth/signup.ts`, `src/components/auth/SignUpForm.tsx`) captures only email + password — no department is captured or linked anywhere. `enable_confirmations = false` locally, so a session exists immediately after signup (confirmed by `scripts/smoke.mjs` signing in right after signup).
- The app is already deployed (per `context/deployment/deploy-plan.md`); any already-registered accounts have no department.
- No `zod` dependency and no `src/lib/services/` directory exist yet, despite both being documented conventions (AGENTS.md).
- Only `src/components/ui/button.tsx` exists under the shadcn `new-york` component set; `Input`/`Label`/`Table` aren't installed.
- `src/components/Topbar.astro` (email + dashboard link + sign out) is only wired into `Welcome.astro`, not `dashboard.astro`.

### Key Discoveries:

- `src/components/auth/FormField.tsx:8-20` requires a mandatory `icon` prop and controlled `value`/`onChange` — not a good fit for plain employee fields; new employee-form fields should use fresh shadcn `Input`/`Label` primitives instead of forcing this component.
- `src/components/auth/SubmitButton.tsx:11-33` already wraps shadcn `Button` with `useFormStatus` pending state — reusable as-is for the new employee form.
- `supabase/config.toml:209` and `:244` (`enable_confirmations = false`) means a Supabase session is created synchronously inside the `signUp()` call — the auth trigger that creates a `profiles` row must run as part of that same `auth.users` insert, not a separate step.
- `.github/workflows/ci.yml:39-53` runs `supabase start` for the smoke job, which applies `supabase/migrations/*.sql` and `supabase/seed.sql` automatically — no CI changes are needed for the new schema to be exercised in CI.
- AGENTS.md designates `src/lib/services/` for business logic and `src/types.ts` for shared DTOs — both currently absent.

## Desired End State

A help desk/IT user can sign up while selecting their department from a required dropdown; on login, they reach `/employees`, where they can add an employee (first name, last name, position, phone) and see the alphabetically-sorted list of employees belonging to their own department only. A second user in a different department never sees the first user's employees, enforced by Postgres RLS (not application code).

Verification: `npm run smoke` passes, including a new cross-department isolation check; `npx astro check` and `npm run lint` pass; a manual walkthrough confirms the add-employee form, list, and department isolation.

## What We're NOT Doing

- Editing or deleting employee records (S-02).
- Department logo upload/management (S-03).
- Signature script generation (S-04) or emailing new employees (S-05).
- Any UI to create/rename/delete departments — the four seeded departments (IT, HR, Sales, Finance) are the fixed initial set; adding more later is a manual migration, not an app feature.
- A cross-department admin role.
- AD/HR auto-import of employee data.
- Strict phone number format enforcement — per the PRD's Business Logic, an invalid-looking phone number produces a non-blocking inline warning only.
- Pagination, search, or filtering on the employee list (PRD target scale is `data_volume: small`).
- Migrating Supabase off the managed cloud to self-hosted (tracked separately, deferred per `context/deployment/deploy-plan.md`).

## Implementation Approach

Postgres RLS is the enforcement boundary for department isolation (not application-level filtering), per the interview decision to join against a `profiles` table at query time. Department selection moves to signup (a required dropdown, populated from the seeded `departments` table, readable pre-auth), and a `SECURITY DEFINER` trigger on `auth.users` creates the matching `profiles` row atomically using metadata passed into `signUp()`. Employee reads/writes go through a thin service layer (`src/lib/services/employees.ts`) and a single `/api/employees` route; the route never accepts a `department_id` from the client — it's always inferred server-side from the caller's own profile, so isolation holds even if RLS were ever misconfigured.

## Critical Implementation Details

- **Signup → trigger ordering**: the department must be passed as `options.data.department_id` in the *initial* `supabase.auth.signUp()` call (as `user_metadata`), because the `profiles`-creating trigger fires synchronously on the `auth.users` insert that `signUp()` performs. Setting the department via a separate post-signup update would race the trigger (which expects the value already present in `NEW.raw_user_meta_data`) and leave `profiles.department_id` null.
- **`departments` is the one anonymously-readable table**: because the signup page renders and needs to populate its department dropdown before any session exists, `departments` RLS must permit `SELECT` to the `anon` role — the only table in this schema with that exception. `profiles` and `employees` remain authenticated-only.

## Phase 1: Department-scoped data foundation (F-01)

### Overview

Creates `departments`, `profiles`, and `employees` tables with row-level security, seeds the four initial departments, and wires an `auth.users` trigger that creates a matching `profiles` row at signup time.

### Changes Required:

#### 1. Schema, RLS, and signup trigger migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_department_scoped_data_foundation.sql`

**Intent**: Establish the department-scoped data model and its isolation boundary in one migration, so every later slice (S-01 through S-05) inherits a tested RLS boundary instead of re-deriving its own scoping logic.

**Contract**:
- `departments(id uuid pk default gen_random_uuid(), name text unique not null, logo_url text, created_at timestamptz not null default now())`.
- `profiles(id uuid pk references auth.users(id) on delete cascade, department_id uuid not null references departments(id), created_at timestamptz not null default now())` — one row per user, `id` doubles as the FK to `auth.users`.
- `employees(id uuid pk default gen_random_uuid(), department_id uuid not null references departments(id), first_name text not null, last_name text not null, position text not null, phone text not null, created_at timestamptz not null default now())`.
- RLS enabled on all three tables with granular, per-operation policies:
  - `departments`: `SELECT` allowed to both `anon` and `authenticated` (needed for the pre-auth signup dropdown — see Critical Implementation Details). No `INSERT`/`UPDATE`/`DELETE` policy for any app role (seeding is migration-only).
  - `profiles`: `SELECT`/`INSERT` restricted to `auth.uid() = id` (a user only ever reads/creates their own profile row; created by the trigger below, not directly by the client).
  - `employees`: `SELECT` and `INSERT` policies both use `exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.department_id = employees.department_id)`.
- A `SECURITY DEFINER` trigger function `public.handle_new_user()` and trigger `on_auth_user_created after insert on auth.users` that inserts into `profiles(id, department_id)` reading `department_id` from `NEW.raw_user_meta_data ->> 'department_id'` (cast to `uuid`), because this exact cast-and-read is the one non-obvious wiring point every later step depends on:
  ```sql
  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer set search_path = public
  as $$
  begin
    insert into public.profiles (id, department_id)
    values (new.id, (new.raw_user_meta_data ->> 'department_id')::uuid);
    return new;
  end;
  $$;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```

#### 2. Seed data

**File**: `supabase/seed.sql`

**Intent**: Provide the fixed initial department list so local dev, CI's smoke job, and the signup dropdown all have real data to work against.

**Contract**: `insert into public.departments (name) values ('IT'), ('HR'), ('Sales'), ('Finance');`

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration and seed cleanly (exit code 0).
- `select count(*) from public.departments;` returns `4` after reset.
- `npx astro check` passes with no new type errors.

#### Manual Verification:

- In Supabase Studio (local), confirm RLS is enabled on all three new tables and that `anon` can `select` from `departments` but not `profiles`/`employees`.
- Manually sign up a test user via the existing (pre-Phase-2) flow and confirm a `profiles` row is NOT yet created (expected — the trigger reads `department_id` from metadata that Phase 2 will start sending); this confirms the trigger doesn't silently insert a null-department row that would need cleanup later.

---

## Phase 2: Signup flow — required department selection

### Overview

Adds a required department dropdown to signup, sourced from the seeded `departments` table, and threads the selection through to the `signUp()` call so Phase 1's trigger can populate `profiles`.

### Changes Required:

#### 1. Fetch departments server-side and pass to the form

**File**: `src/pages/auth/signup.astro`

**Intent**: Load the department list before rendering, following the existing pattern of server-side data resolution in Astro pages (no client-side fetch).

**Contract**: Query `departments(id, name)` ordered by `name` using the existing `createClient()` helper (the `anon`-readable policy from Phase 1 makes this work pre-auth); pass the result as a new `departments` prop to `<SignUpForm />`.

#### 2. Add the department field to the signup form

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Capture a required department choice alongside email/password, validated client-side like the existing fields.

**Contract**: New `departments: { id: string; name: string }[]` prop; new controlled `departmentId` state defaulting to empty; `validate()` gains a required-field check for `departmentId`; render a native `<select name="departmentId">` populated from the prop (a plain `<select>`, not a shadcn primitive, to match this file's existing hand-rolled style rather than mixing conventions mid-form).

#### 3. Thread the selection into `signUp()`

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Pass the chosen department into Supabase Auth's user metadata so Phase 1's trigger can read it during the same request.

**Contract**: Read `departmentId` from the submitted form data; validate it's a non-empty string with a plain manual check (e.g. `if (!departmentId) { ... }`) before calling `supabase.auth.signUp({ email, password, options: { data: { department_id: departmentId } } })`. If `departmentId` is missing, redirect back to `/auth/signup` with an error, mirroring the existing error-redirect pattern. `zod` is not a dependency yet at this point in the phase order (added in Phase 3) — do not import it here.

**Note on phase ordering**: `src/pages/api/auth/signup.ts` isn't touched again in Phase 3 (that phase only adds validation to the new `/api/employees` route), so this manual check is the permanent implementation for `departmentId` — not a placeholder awaiting `zod`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- Signing up without selecting a department shows a client-side validation error and does not submit.
- Signing up with a department selected creates a `profiles` row with the correct `department_id` (verify via Supabase Studio or a `select` against the local DB).
- Signing up with an invalid/tampered department id (e.g. a non-existent uuid posted directly to the API) fails cleanly (FK constraint violation surfaces as a redirect-with-error, not a 500 with a stack trace).

---

## Phase 3: Employee service layer and API

### Overview

Introduces `zod`, the `src/lib/services/` convention, and the `/api/employees` route that implements FR-002 (add) and the FR-003 view portion (list), relying entirely on Phase 1's RLS for isolation.

### Changes Required:

#### 1. Add the zod dependency

**File**: `package.json`

**Intent**: AGENTS.md mandates zod validation for API routes; it's missing from the current dependency set.

**Contract**: Add `zod` to `dependencies` at its current stable major version; run `npm install`.

#### 2. Shared employee types

**File**: `src/types.ts` (new)

**Intent**: Establish the shared-DTO location AGENTS.md designates but that doesn't exist yet.

**Contract**: Export `EmployeeDTO` (`id`, `firstName`, `lastName`, `position`, `phone`, `createdAt`) and `CreateEmployeeInput` (`firstName`, `lastName`, `position`, `phone`) — camelCase at the API boundary, mapped to/from the snake_case DB columns inside the service layer.

#### 3. Employee service

**File**: `src/lib/services/employees.ts` (new)

**Intent**: Centralize the two data operations this slice needs, keeping API route handlers thin and matching the AGENTS.md-designated location for business logic.

**Contract**: `listEmployees(supabase): Promise<EmployeeDTO[]>` selects from `employees` ordered by `last_name, first_name` (RLS narrows to the caller's department automatically — no `department_id` filter is written in application code). `createEmployee(supabase, input: CreateEmployeeInput): Promise<EmployeeDTO>` first reads the caller's own `department_id` from `profiles` (via `auth.uid()`), then inserts into `employees` using that department id — the department is never taken from client input, so a tampered request body can't target another department even if RLS were misconfigured.

#### 4. API route

**File**: `src/pages/api/employees/index.ts` (new)

**Intent**: Expose the add/list operations as `GET`/`POST`, following the repo's uppercase-export + zod-validation convention.

**Contract**: `export const prerender = false;`. `GET` returns `context.locals.user`-gated `listEmployees()` results as JSON (401 if no user). `POST` parses/validates the JSON or form body against a zod schema (`firstName`/`lastName`/`position` non-empty strings; `phone` any non-empty string — permissive per the PRD's warn-don't-block rule) and calls `createEmployee()`; returns the created `EmployeeDTO` or a 400 with field errors on validation failure.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npx astro check` pass.
- `npm run build` succeeds with `zod` resolved as a dependency.

#### Manual Verification:

- `POST /api/employees` with a valid body while signed in creates an employee visible in a subsequent `GET /api/employees`.
- `POST /api/employees` with a missing required field returns a 400 with a clear field-level error, not a 500.
- `GET`/`POST /api/employees` while signed out returns 401.

---

## Phase 4: Employee UI

### Overview

Adds the `/employees` page (protected, alphabetical list + add form), installs the missing shadcn primitives, and extends navigation.

### Changes Required:

#### 1. Install shadcn primitives

**Command**: `npx shadcn@latest add input label table`

**Intent**: The employee form and list need `Input`/`Label`/`Table`, none of which exist yet under `src/components/ui/`.

**Contract**: Installed at the `new-york` style/`neutral` base color already configured in `components.json` — no config changes needed.

#### 2. Protect the new routes

**File**: `src/middleware.ts`

**Intent**: Follow the existing hard rule — route protection is a `PROTECTED_ROUTES` array entry, never a per-page check.

**Contract**: Extend `PROTECTED_ROUTES` to `["/dashboard", "/employees"]`. The `/api/employees` route enforces its own 401 (Phase 3) since API routes aren't path-prefix-matched by this array today; no change to the array's matching logic is needed for the API route.

#### 3. Employees page (server-rendered list)

**File**: `src/pages/employees.astro` (new)

**Intent**: Server-render the employee list (Astro-first per repo convention — React only where interactive), fetched via `listEmployees()` directly in the page frontmatter.

**Contract**: Renders a `Table` of the current user's department's employees (already alphabetical per Phase 3's query), an empty-state message when the list is empty, and mounts `<AddEmployeeForm client:load />` above or beside the table. Includes `<Topbar />` (see below) for consistent navigation.

#### 4. Add-employee form

**File**: `src/components/employees/AddEmployeeForm.tsx` (new)

**Intent**: Mirror the existing auth-form pattern (plain `<form method="POST">`, `SubmitButton`, `ServerError`) rather than introducing a new AJAX pattern, so the add flow is a full-page POST + redirect back to `/employees` like signup/signin.

**Contract**: Fields for first name, last name, position (all shadcn `Input`+`Label`, required, non-blocking client validation), and phone with a non-blocking inline warning — not a submit-blocking error — when the value doesn't loosely look like a phone number:
```ts
const phoneLooksValid = /^[+\d][\d\s()-]{5,}$/.test(phone);
```
This mirrors the PRD's explicit "warn, never block" rule; the warning renders like the existing `FormField` hint pattern but the form still submits regardless of `phoneLooksValid`.

#### 5. Navigation

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Give a signed-in user a visible way to reach the new page; currently `Topbar` isn't wired into `dashboard.astro` at all.

**Contract**: Add an "Employees" link (`/employees`) to `Topbar`'s signed-in branch; render `<Topbar />` at the top of `dashboard.astro`'s layout (it isn't there today) and `employees.astro`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, and `npm run build` all pass.

#### Manual Verification:

- A signed-in user can navigate from the dashboard to `/employees` via the Topbar link.
- Adding an employee with valid data shows it in the list immediately after the redirect, sorted alphabetically among any existing entries.
- Entering an implausible phone number shows the inline warning but the form still submits successfully.
- Visiting `/employees` while signed out redirects to `/auth/signin`.

---

## Phase 5: Cross-department isolation testing

### Overview

Extends the project's only automated check (`scripts/smoke.mjs`) to cover the add+list flow and, critically, the PRD's hardest guardrail: that a user in one department can never see another department's employees.

### Changes Required:

#### 1. Extend the smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Directly verify department isolation at the HTTP level, since this is the single highest-risk item in the milestone per the roadmap ("if RLS policies are wrong, the PRD's hardest guardrail breaks silently").

**Contract**: Update the existing signup step's form payload to include a `departmentId` (fetch or hardcode a seeded department id, e.g. by name lookup against the local DB via the existing Supabase client, or by relying on a known seeded id if deterministic). Add new steps after the existing dashboard checks: (a) POST an employee via `/api/employees` as the first smoke user, assert 200/201 and the response contains the submitted name; (b) GET `/api/employees` as that same user, assert the employee is present; (c) sign up a second smoke user with a *different* seeded department, sign in as them, GET `/api/employees`, and assert the first user's employee is **not** present in the response.

#### 2. Document the manual backfill for pre-existing accounts

**File**: `README.md`

**Intent**: The app is already deployed with users who signed up before this change and therefore have no `profiles` row — record the accepted one-off manual step (per the interview decision) rather than building an in-app remediation flow.

**Contract**: Add a short "Post-deploy one-off" note with the backfill statement, explicitly flagged as needing a real department chosen per user before running against production data:
```sql
insert into public.profiles (id, department_id)
select id, (select id from public.departments where name = 'IT') -- adjust per user before running in production
from auth.users
where id not in (select id from public.profiles);
```

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes locally against a fresh `supabase db reset` + `npm run build && npm run preview`.
- CI's `smoke` job (`.github/workflows/ci.yml`) passes unchanged (no CI config edits needed — `supabase start` already applies migrations/seed).

#### Manual Verification:

- Manually re-run the two-user isolation scenario once against a deployed preview to confirm production RLS behaves the same as local.

---

## Testing Strategy

### Integration Tests:

- `scripts/smoke.mjs` (extended in Phase 5) is this project's only automated test layer — covers signup-with-department, add employee, list employee, and cross-department isolation end-to-end over real HTTP.

### Manual Testing Steps:

1. Sign up two users into two different departments; confirm each only ever sees their own employees in the UI and via direct API calls.
2. Add an employee with an obviously malformed phone number and confirm the warning shows but submission still succeeds.
3. Confirm the empty-state message renders for a freshly-created department with no employees yet.

## Migration Notes

Pre-existing deployed accounts (signed up before this change) have no `profiles` row and therefore no department. Per the accepted interview decision, this is handled with the one-off manual SQL backfill documented in Phase 5, not an in-app onboarding gate — run and adjust it once, per real user, before general availability of this feature.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01, S-01)
- Change record: `context/changes/add-and-list-employees/change.md`
- PRD: `context/foundation/prd.md` (FR-001–FR-003, US-01, Access Control)
- Deploy plan (backfill/data-residency context): `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Department-scoped data foundation (F-01)

#### Automated

- [x] 1.1 `npx supabase db reset` applies migration and seed cleanly — 21737b4
- [x] 1.2 `select count(*) from public.departments;` returns 4 after reset — 21737b4
- [x] 1.3 `npx astro check` passes with no new type errors — 21737b4

#### Manual

- [x] 1.4 RLS enabled on all three tables; anon can select departments but not profiles/employees
- [x] 1.5 Trigger does not insert a null-department profiles row before Phase 2 lands

### Phase 2: Signup flow — required department selection

#### Automated

- [x] 2.1 `npx astro check` and `npm run lint` pass — 467e895
- [x] 2.2 `npm run build` succeeds — 467e895

#### Manual

- [x] 2.3 Signup without a department selection is blocked client-side — 467e895
- [x] 2.4 Signup with a department creates a profiles row with the correct department_id — 467e895
- [x] 2.5 Signup with a tampered/invalid department id fails cleanly (no 500/stack trace) — 467e895

### Phase 3: Employee service layer and API

#### Automated

- [ ] 3.1 `npm run lint` and `npx astro check` pass
- [ ] 3.2 `npm run build` succeeds with zod resolved

#### Manual

- [ ] 3.3 POST /api/employees creates an employee visible via subsequent GET
- [ ] 3.4 POST with a missing required field returns 400 with field errors, not 500
- [ ] 3.5 GET/POST /api/employees while signed out returns 401

### Phase 4: Employee UI

#### Automated

- [ ] 4.1 `npm run lint`, `npx astro check`, and `npm run build` all pass

#### Manual

- [ ] 4.2 Signed-in user can navigate to /employees via the Topbar link
- [ ] 4.3 Adding an employee shows it in the list immediately, sorted alphabetically
- [ ] 4.4 Implausible phone number shows an inline warning but still submits
- [ ] 4.5 Visiting /employees while signed out redirects to /auth/signin

### Phase 5: Cross-department isolation testing

#### Automated

- [ ] 5.1 `npm run smoke` passes locally against a fresh db reset + build + preview
- [ ] 5.2 CI's smoke job passes unchanged

#### Manual

- [ ] 5.3 Two-user cross-department isolation scenario re-verified against a deployed preview
