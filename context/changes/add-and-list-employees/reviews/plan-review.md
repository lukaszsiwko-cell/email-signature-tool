<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Add and List Employees (with Department-Scoped Data Foundation)

- **Plan**: context/changes/add-and-list-employees/plan.md
- **Mode**: Deep
- **Date**: 2026-09-22
- **Verdict**: SOUND (minor warnings only, all fixed during triage)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 5/5 paths ✓, 3/3 symbols ✓ (2 with line-number drift — see F2), brief↔plan ✓
Codebase verification (deep, via sub-agent): 5/5 claims confirmed, 0 contradicted, 0 blast-radius surprises (no existing `on_auth_user_created`/`handle_new_user` trigger conflicts; no existing `/employees` path collisions; `Topbar` render blast radius limited to `Welcome.astro`; `zod`, `src/lib/services/`, `src/types.ts` confirmed absent; `SUPABASE_KEY` confirmed to be the `anon` key per README, so `auth.uid()`-based RLS resolves correctly).

## Findings

### F1 — Zod-ordering ambiguity between Phase 2 and Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, item 3 ("Thread the selection into signUp()")
- **Detail**: Phase 2's contract said to validate `departmentId` "with zod (added in Phase 3)" even though zod isn't installed until Phase 3, then hedged that either ordering was "acceptable" despite Phase 2's own Automated Verification requiring `npm run build` to pass.
- **Fix**: Phase 2 now uses a plain non-empty-string check (no zod import); the ordering note clarifies `signup.ts` isn't touched again in Phase 3, so the manual check is permanent, not a placeholder.
- **Decision**: FIXED (applied to plan.md)

### F2 — Two cited line numbers don't match the file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries section
- **Detail**: Plan cited `supabase/config.toml:130` for `enable_confirmations = false` (actual: lines 209 and 244) and `.github/workflows/ci.yml:29-42` for the `supabase start` smoke step (actual: lines 39-53). Underlying claims were correct; only the line pointers were stale.
- **Fix**: Citations corrected to `config.toml:209`/`:244` and `ci.yml:39-53`.
- **Decision**: FIXED (applied to plan.md)

### F3 — F-01's own roadmap entry isn't synced to "planning"

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: context/foundation/roadmap.md (outside plan.md)
- **Detail**: This plan fully implements F-01's scope, but F-01's own roadmap row still reads `ready` (only S-01 was flipped per the exact-Change-ID sync rule), risking a redundant/conflicting future F-01 plan.
- **Fix**: Added a one-line cross-reference note to F-01's roadmap entry pointing to this plan, without changing its `Status` field.
- **Decision**: FIXED (applied to roadmap.md)
