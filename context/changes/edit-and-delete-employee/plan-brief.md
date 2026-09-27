# Edit and Delete Employee Records — Plan Brief

> Full plan: `context/changes/edit-and-delete-employee/plan.md`

## What & Why

S-01 delivered add + view for employees; this slice completes FR-003 by letting a user edit or delete an employee record within their own department, using the same Postgres RLS isolation boundary already proven in S-01.

## Starting Point

`employees` table has RLS `SELECT`/`INSERT` policies only. Service layer (`src/lib/services/employees.ts`) has `listEmployees`/`createEmployee`. API (`src/pages/api/employees/index.ts`) has `GET`/`POST` only. `/employees` page renders a static SSR table with an `AddEmployeeForm` React island above it — no edit/delete affordances exist yet.

## Desired End State

On `/employees`, a user can click "Edit" on any row to edit it inline (same four fields as add), or "Delete" to get an inline "Are you sure? Yes/No" prompt. Both actions only ever succeed for the caller's own department's employees — targeting another department's employee id returns 404. Verified end-to-end by an extended smoke test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Edit interaction pattern | Inline-editable table row | No new page/modal needed; consistent with the existing table, least code |
| Delete confirmation UX | Inline "Are you sure? Yes/No" in the row | Matches the app's glass-panel aesthetic better than a native `window.confirm()` popup |
| Post-action refresh | Full page reload | Consistent with `AddEmployeeForm`'s existing pattern; avoids introducing client-side list-state synchronization |
| Edit form fields | Same 4 fields as create, same validation | No new requirements surfaced; keeps one validation rule set to maintain |
| Cross-department write attempt | RLS makes the row invisible; API translates 0-rows-affected into 404 | Matches how RLS already behaves for reads; distinguishes "not found" from a genuine server error |

## Scope

**In scope:**
- `UPDATE`/`DELETE` RLS policies on `employees`, scoped by department (mirrors existing `SELECT`/`INSERT` policies)
- `updateEmployee`/`deleteEmployee` in the service layer
- `PUT`/`DELETE` on a new `/api/employees/[id]` route
- Inline edit + inline delete-confirm UI on the `/employees` table (`EmployeeTable.tsx` React island)
- Smoke test coverage for edit, delete, and cross-department isolation on both

**Out of scope:**
- Department logo (S-03), signature scripts/emailing (S-04/S-05)
- Bulk edit/delete, undo, soft-delete
- Optimistic/local client-state list updates (full reload chosen instead)
- A `Dialog`/modal shadcn primitive (not needed given the inline pattern chosen)

## Architecture / Approach

RLS gains `UPDATE`/`DELETE` policies using the identical department-scoping predicate already used for `SELECT`/`INSERT`. The service layer and a new dynamic API route follow the exact shape of S-01's `listEmployees`/`createEmployee` + `/api/employees` route. The employee table becomes a client-side React island (`EmployeeTable.tsx`) so each row can independently enter edit mode or show a delete confirmation; successful mutations trigger a full page reload rather than in-place state reconciliation, keeping the client simple and consistent with `AddEmployeeForm`'s existing behavior.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. RLS policies | UPDATE/DELETE policies on `employees` | Must scope by department exactly like existing SELECT/INSERT, including `with check` on UPDATE |
| 2. Service + API | `updateEmployee`/`deleteEmployee`, `/api/employees/[id]` (PUT/DELETE) | Must distinguish "0 rows affected" (404) from a genuine error (500) |
| 3. Inline edit/delete UI | `EmployeeTable.tsx` React island wired into `/employees` | Per-row state management without over-complicating the component |
| 4. Isolation testing | Extended smoke test for edit/delete + cross-department negative case | Only real automated proof the new write paths are isolated |

**Prerequisites:** S-01 (add-and-list-employees) — done.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open Risks & Assumptions

- No `Dialog`/modal primitive is introduced; if a future slice needs one, it'll be added then rather than pre-emptively here.
- Full-page reload after edit/delete is a deliberate simplicity trade-off; if the employee list grows large enough that reload latency becomes noticeable, a later slice could revisit in-place updates.

## Success Criteria (Summary)

- A user can edit and delete employees inline on `/employees`, scoped strictly to their own department.
- Attempting to edit/delete another department's employee id returns 404 via the API.
- `npm run smoke` (extended), `npm run lint`, `npx astro check`, and `npm run build` all pass.
