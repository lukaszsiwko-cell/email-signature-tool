# Edit and Delete Employee Records Implementation Plan

## Overview

Extends the S-01 add-and-list-employees feature with the remaining half of FR-003: editing and deleting an employee record, scoped to the caller's own department, enforced by Postgres RLS the same way reads/inserts already are. Adds inline row editing and inline delete confirmation to the existing `/employees` table.

## Current State Analysis

- `employees` table has RLS `SELECT` and `INSERT` policies only (`supabase/migrations/20260922193159_department_scoped_data_foundation.sql`) — no `UPDATE`/`DELETE` policy exists yet, so both operations would currently be rejected by RLS even if application code attempted them.
- `src/lib/services/employees.ts` has `listEmployees`/`createEmployee` only.
- `src/pages/api/employees/index.ts` handles `GET`/`POST` only; there is no dynamic `[id]` route yet.
- `src/pages/employees.astro` renders the employee table as static SSR markup (no interactivity) plus the `AddEmployeeForm` React island; rows have no edit/delete affordances.
- `src/types.ts` has `EmployeeDTO`/`CreateEmployeeInput` only.
- `AddEmployeeForm.tsx` establishes the pattern this plan reuses: shadcn `Input`/`Label`, local `isSubmitting` state (not `useFormStatus`, since it submits via `fetch` not native navigation), non-blocking phone-format hint, full-page reload (`window.location.href = "/employees"`) on success.

### Key Discoveries:

- The existing SELECT/INSERT RLS policies both use the identical `exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.department_id = employees.department_id)` predicate — the UPDATE/DELETE policies in this plan reuse it verbatim, with `UPDATE` needing it in both `using` and `with check` (so a caller can't retarget a row to a different department via the update itself).
- `src/pages/employees.astro` currently renders the `<Table>` inline as plain SSR JSX with no React boundary around individual rows — inline editing requires promoting the table body to a client-side React component so per-row edit/delete state can exist.
- The user chose full-page reload after edit/delete (matching `AddEmployeeForm`), so the new table component does not need to manage a synchronized client-side employee list after mutations — a successful save/delete just navigates back to `/employees`, letting the SSR page refetch.

## Desired End State

On `/employees`, a signed-in user can click "Edit" on any row in their own department to turn it into inline input fields (same four fields as add: first name, last name, position, phone), save or cancel, and click "Delete" to get an inline "Are you sure? Yes/No" confirmation before the row is removed. Both actions only affect the caller's own department's employees; attempting to target another department's employee id via the API returns 404 (not found, since RLS makes the row invisible rather than merely forbidden).

Verification: `npm run smoke` passes, including new edit/delete + cross-department isolation checks; `npx astro check` and `npm run lint` pass; a manual walkthrough confirms inline edit, inline delete confirm, and full-page reload behavior.

## What We're NOT Doing

- Department logo upload/management (S-03).
- Signature script generation (S-04) or emailing new employees (S-05).
- Bulk edit/delete, undo, or soft-delete/trash.
- Optimistic client-side list updates (explicitly deferred — full page reload was chosen).
- A modal/dialog component (no `Dialog` primitive exists yet in the shadcn set; inline row editing was chosen instead).
- Strict phone number format enforcement — same non-blocking warning behavior as create.
- Changing which fields are editable — edit reuses the exact same four fields and validation as create.

## Implementation Approach

RLS gains `UPDATE`/`DELETE` policies mirroring the existing `SELECT`/`INSERT` shape. The service layer gains `updateEmployee`/`deleteEmployee`, and a new dynamic route `src/pages/api/employees/[id].ts` exposes `PUT`/`DELETE`, reusing the same zod schema shape as the existing `POST` route. On the client, the SSR table markup in `employees.astro` is replaced by a new `EmployeeTable.tsx` React island (`client:load`) that receives the server-fetched `employees` list as a prop and manages per-row edit-mode/delete-confirm state locally; successful mutations trigger a full page reload rather than local state reconciliation.

## Critical Implementation Details

- **RLS `UPDATE` needs the predicate in both `using` and `with check`**: `using` gates which existing rows are visible/updatable; `with check` gates what the row can be changed *to*. Since `department_id` itself is never part of the update payload (only name/position/phone fields change), `with check` reusing the same predicate simply re-confirms the (unchanged) department still matches the caller — it's defense in depth, not a new capability.
- **A tampered-department update is already impossible before RLS is even consulted**: like `createEmployee`, `updateEmployee` must never accept `department_id` from client input — the API route's zod schema for `PUT` only accepts `firstName`/`lastName`/`position`/`phone`, never `departmentId`.
- **RLS makes a cross-department id invisible, not merely forbidden**: `UPDATE`/`DELETE` on a row RLS hides returns zero affected rows, not an error — the service layer must explicitly check for "0 rows returned" and the API route must translate that into a `404`, distinguishing it from a genuine `500`.

## Phase 1: RLS — UPDATE and DELETE policies

### Overview

Adds the missing `UPDATE`/`DELETE` row-level security policies on `employees`, scoped to the caller's own department, using the same predicate as the existing `SELECT`/`INSERT` policies.

### Changes Required:

#### 1. RLS policy migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_employees_update_delete_policies.sql`

**Intent**: Close the gap left by Phase 1 of S-01, which only added `SELECT`/`INSERT` policies — without this migration, `UPDATE`/`DELETE` statements are rejected outright by RLS regardless of application code.

**Contract**:
```sql
create policy "users can update employees in their department"
  on public.employees
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );

create policy "users can delete employees in their department"
  on public.employees
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );
```

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the new migration cleanly on top of the existing one (exit code 0).
- `npx astro check` passes (no schema-adjacent type changes expected, but confirms nothing broke).

#### Manual Verification:

- In Supabase Studio (local), confirm `employees` now shows four policies total (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), each scoped to `authenticated`.
- Manually attempt (via SQL editor, impersonating a JWT for one department's user) to update/delete a row belonging to a different department and confirm zero rows are affected.

---

## Phase 2: Service layer and API

### Overview

Adds `updateEmployee`/`deleteEmployee` to the service layer and a new dynamic `/api/employees/[id]` route exposing `PUT` (update) and `DELETE`, reusing Phase 1's RLS as the sole isolation boundary.

### Changes Required:

#### 1. Service functions

**File**: `src/lib/services/employees.ts`

**Intent**: Keep API route handlers thin, matching the existing `listEmployees`/`createEmployee` pattern.

**Contract**:
- `updateEmployee(supabase, id: string, input: CreateEmployeeInput): Promise<EmployeeDTO | null>` — updates `first_name`/`last_name`/`position`/`phone` on the row matching `id`, `.select(...).maybeSingle()` (not `.single()`, since RLS may legitimately return zero rows for a cross-department id — that must not throw). Returns `null` when no row was affected (id not found or not in caller's department); throws only on a genuine Postgres error.
- `deleteEmployee(supabase, id: string): Promise<boolean>` — deletes the row matching `id`, `.select("id")` to get affected-row count back, returns `true` if a row was deleted, `false` if zero rows were affected (same not-found-vs-error distinction as above).
- Never accepts or writes `department_id` in either function — RLS alone determines whether the row is reachable.

#### 2. Dynamic API route

**File**: `src/pages/api/employees/[id].ts` (new)

**Intent**: Expose edit/delete over HTTP following the same auth/validation/error-shape conventions as the existing `src/pages/api/employees/index.ts`.

**Contract**: `export const prerender = false;`. Both handlers first check `context.locals.user` (401 if absent) and construct the Supabase client (500 if not configured) — mirroring `index.ts`. `PUT`: parses `context.params.id`, validates the body with the same field schema as `POST` in `index.ts` (`firstName`/`lastName`/`position`/`phone`, all required strings) via a schema shared or duplicated from `index.ts` (extract to a small shared constant if trivial, otherwise duplicate — matching whichever keeps both routes simplest), returns `400` on validation failure, calls `updateEmployee`, returns `404` if it resolves `null`, otherwise `200` with the updated `EmployeeDTO`. `DELETE`: parses `context.params.id`, calls `deleteEmployee`, returns `404` if it resolves `false`, otherwise `200` (or `204`) with no/empty body on success. Both catch unexpected errors into `500` exactly like `index.ts`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- `PUT /api/employees/:id` with valid body updates the row and returns the updated `EmployeeDTO` (verify via a manual PowerShell `Invoke-WebRequest` call against the local dev server, signed in).
- `PUT`/`DELETE` against an id belonging to a different department (created via a second test user) returns `404`.
- `DELETE /api/employees/:id` removes the row; a subsequent `GET /api/employees` no longer includes it.
- `PUT` with a missing required field returns `400` with field errors, matching the `POST` route's shape.

---

## Phase 3: UI — inline edit and inline delete confirmation

### Overview

Replaces the static SSR employee table in `employees.astro` with an interactive `EmployeeTable.tsx` React island supporting inline row editing and inline delete confirmation, with a full-page reload after either action succeeds.

### Changes Required:

#### 1. Employee table component

**File**: `src/components/employees/EmployeeTable.tsx` (new)

**Intent**: Give each row independent edit-mode and delete-confirm state without turning the whole page into a SPA — mirrors `AddEmployeeForm.tsx`'s fetch + full-reload pattern.

**Contract**: `client:load` React component, props `{ employees: EmployeeDTO[] }`. Renders the existing `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableCell` primitives (same styling as today) plus a new trailing "Actions" column. Per-row local state: `editingId: string | null`, `confirmingDeleteId: string | null`, plus a per-row draft object for the four editable fields while in edit mode. Non-edit-mode row: renders values as today, plus "Edit" and "Delete" buttons in the Actions cell. Edit-mode row: the four data cells become shadcn `Input`s (styled consistently with `AddEmployeeForm`), Actions cell becomes "Save"/"Cancel". Delete-confirm state: Actions cell becomes "Are you sure? Yes/No" text/buttons in place of Edit/Delete, replacing them only for that row (other rows unaffected). "Save" calls `PUT /api/employees/:id` via `fetch`; on success, `window.location.href = "/employees"`; on failure, shows an inline error message within that row without reloading. "Yes" (delete confirm) calls `DELETE /api/employees/:id`; same success/failure handling. Reuses the same non-blocking phone-format hint text as `AddEmployeeForm` while a row is in edit mode.

#### 2. Wire the new component into the page

**File**: `src/pages/employees.astro`

**Intent**: Replace the plain SSR table markup with the new interactive component while keeping the empty-state and error-state branches unchanged.

**Contract**: Import `EmployeeTable` from `@/components/employees/EmployeeTable`; in the `employees.length === 0` / else branch, replace the inline `<Table>...</Table>` JSX with `<EmployeeTable employees={employees} client:load />`. No other markup on the page changes.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- Clicking "Edit" on a row turns its four cells into inputs pre-filled with current values; "Cancel" reverts without any request; "Save" persists changes and the page reloads showing the update.
- Clicking "Delete" shows an inline "Are you sure?" prompt in place of the row's action buttons; "No" reverts to normal Edit/Delete buttons; "Yes" deletes the row and the page reloads without it.
- Editing/deleting only ever succeeds for employees in the signed-in user's own department (no UI affordance is shown for other departments' data, since the SSR list itself is already RLS-scoped).

---

## Phase 4: Smoke test coverage for edit/delete + isolation

### Overview

Extends `scripts/smoke.mjs` with edit and delete flows, including the cross-department negative case (editing/deleting another department's employee id must fail with `404`), following the pattern established in S-01's Phase 5.

### Changes Required:

#### 1. Smoke test steps

**File**: `scripts/smoke.mjs`

**Intent**: Provide the only real automated proof that the new RLS policies and API routes correctly enforce department isolation on writes, not just reads.

**Contract**: Reusing the existing multi-jar cookie/user setup from S-01's isolation test, add steps for: (1) `PUT /api/employees/:id` on the first user's own employee succeeds and the change is reflected in a subsequent `GET`; (2) `PUT`/`DELETE` on that same id attempted as the second user (different department) both return `404`; (3) `DELETE /api/employees/:id` on the first user's own employee succeeds and a subsequent `GET` no longer includes it.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes all steps, including the new edit/delete/isolation checks.

#### Manual Verification:

- None beyond the automated smoke run — this phase is testing-only.

---

## Testing Strategy

- **Unit tests**: None exist in this repo (documented convention: `scripts/smoke.mjs` is the only automated check); no new unit test framework is introduced by this plan.
- **Integration tests**: `scripts/smoke.mjs` extended per Phase 4, run against a local Supabase + dev server.
- **Manual testing**: Each phase's Manual Verification steps above, using two department-distinct test accounts as established in S-01.

## Migration Notes

No data migration is needed — this plan only adds RLS policies and new read/write code paths against the existing `employees` table shape. No existing rows change format.

## References

- Original request: roadmap item S-02 (`context/foundation/roadmap.md`), PRD FR-003 edit/delete portion (`context/foundation/prd.md`)
- Related plan: `context/changes/add-and-list-employees/plan.md` (Phases 1, 3, 4 established the RLS/service/API/UI patterns this plan extends)
