<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add and List Employees (with Department-Scoped Data Foundation)

- **Plan**: context/changes/add-and-list-employees/plan.md
- **Scope**: Phase 1-2 of 5 (all Progress-complete phases; Phase 3-5 not yet started)
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-23
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `profiles` INSERT policy lets any authenticated user self-assign a department

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260922193159_department_scoped_data_foundation.sql:43-47`
- **Detail**: The `"users can insert their own profile"` policy only checks `auth.uid() = id` — it never constrains `department_id`. Because RLS is this app's *sole* isolation boundary (per the plan's own Implementation Approach) and `employees` access is entirely gated by `profiles.department_id`, any authenticated user who does not yet have a `profiles` row can call `supabase.from("profiles").insert(...)` directly from the client with **any** department id of their choosing and immediately gain read/write access to that department's employees. This isn't a theoretical edge case: the plan's own Migration Notes acknowledge that all pre-existing deployed accounts have no `profiles` row until a manual backfill (Phase 5) runs — during that window, any legacy user can self-escalate into any department. The gap also persists structurally afterward for any future account whose trigger-created row is ever missing. This matches the plan's contract verbatim, so it's a plan-level flaw, not implementation drift.
- **Fix**: Drop the client-facing `"users can insert their own profile"` INSERT policy on `profiles` entirely. No application code inserts into `profiles` directly — the only writer is the `SECURITY DEFINER` `handle_new_user()` trigger (which bypasses RLS), and the Phase 5 backfill script is intended to run with elevated (service-role/superuser) access outside RLS. Removing the policy closes the escalation path with no loss of current functionality.
  - Strength: Removes an entire class of privilege escalation with a single-line migration change; no code path currently depends on the client being able to insert its own profile.
  - Tradeoff: If a future feature ever needs a client-initiated profile self-heal (e.g., in-app remediation for legacy accounts), that policy would need to be reintroduced with a properly scoped `WITH CHECK` (e.g., validating against an allow-listed default department, not arbitrary client input).
  - Confidence: HIGH — confirmed no current call site (`signup.ts`, service layer) performs a client-side `profiles` insert; the trigger and backfill are the only writers.
  - Blind spot: Haven't inspected the not-yet-implemented Phase 5 backfill script's actual execution context (assumed service-role/CLI, per its SQL-only presentation in the plan) — worth confirming when Phase 5 lands.
- **Decision**: PENDING

### F2 — Signup page silently swallows department-list fetch failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/auth/signup.astro:14-18`
- **Detail**: If the `departments` query errors, the page falls back to `departments = []` with no user-facing message. The form then renders a **required** department `<select>` with zero options — the user is stuck with no explanation of why signup is impossible. Neither the plan nor `signin.astro`'s pattern anticipates this failure mode explicitly, but it's a straightforward reliability gap in a page whose entire form is gated on this data being present.
- **Fix**: When `departmentsError` is set, render a visible inline error banner (reusing the existing `error` query-param banner pattern already on the page) instead of silently falling back to an empty list.
- **Decision**: PENDING

### F3 — `handle_new_user()` gives no user-friendly error for a malformed department id

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260922193159_department_scoped_data_foundation.sql:75-83`, `src/pages/api/auth/signup.ts:10-12`
- **Detail**: `signup.ts` only checks that `departmentId` is a non-empty string; it doesn't validate UUID format or that the id exists. An invalid value reaches `(new.raw_user_meta_data ->> 'department_id')::uuid` inside the trigger, which throws a raw Postgres cast/FK error. This is already caught by `signup.ts`'s generic `if (error)` branch and redirected with `error.message` — so Phase 2's manual criterion "fails cleanly, no 500/stack trace" (2.5, already checked done) does hold — but the surfaced message will be a raw Postgres error string rather than a friendly one, since the dropdown is server-rendered from real data and a tampered id is the only way to trigger this.
- **Fix**: Optional — map known Postgres error codes (e.g. invalid UUID syntax, FK violation) to a friendlier message in `signup.ts`'s error branch.
- **Decision**: PENDING

### F4 — Repo-wide lint failures (CRLF line endings) unrelated to this change

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: repo-wide (e.g. `src/layouts/Layout.astro`, `src/pages/dashboard.astro` — files untouched by this change)
- **Detail**: `npm run lint` currently reports 1170 `prettier/prettier` "Delete `␍`" errors across nearly every file in the repo, including files never touched by Phases 1-2. This is a Windows-checkout line-ending artifact (likely missing `.gitattributes`/`core.autocrlf` normalization), not a regression introduced by this implementation — `npx astro check` (0 errors) and `npm run build` (succeeds) both pass cleanly on the reviewed code.
- **Fix**: Not part of this review's scope; if desired, add a `.gitattributes` enforcing LF for tracked text files and re-run `prettier --write`.
- **Decision**: PENDING
