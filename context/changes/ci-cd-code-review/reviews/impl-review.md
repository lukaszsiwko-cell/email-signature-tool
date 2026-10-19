<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Introduce a CI workflow for pull request code reviews

- **Plan**: `context/changes/ci-cd-code-review/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 8 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

- `npm ci --prefix reviewer`: PASS; 0 vulnerabilities reported.
- `npm test --prefix reviewer`: PASS; 28 tests after triage fixes.
- `npm run lint --prefix reviewer`: PASS.
- `npm run typecheck --prefix reviewer`: PASS.
- `npm run lint`, `npx astro check`, and `npm run build`: PASS in the current worktree; clean-checkout lint passes after `dd4a222`.
- Workflow/action trust, concurrency, and verdict contract tests: PASS.
- Clean-checkout verification: Before the lint fix, committed `840506a` passed `npx astro check` but failed `npm run lint` with 39 errors. After `dd4a222`, a detached clean checkout passed both Astro check and repository lint.
- Manual Progress rows are all marked complete and were previously confirmed by the user. Provider dashboard and repository settings are external and cannot be independently verified from the commit.

## Triage status

- F8's lint corrections were committed as `dd4a222`.
- F1-F7 and F9 are fixed and verified in the current worktree, but remain uncommitted. The implementation branch does not contain those fixes yet, so the overall verdict remains NEEDS ATTENTION until they are committed.

## Triage summary

- Fixed: F1-F9.
- Committed: F8 (`dd4a222`).
- Still in the worktree and pending a focused commit: F1-F7 and F9.
- Skipped or accepted: none.

## Findings

### F1 — Checkout credentials persist during package installation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/review.yml:23-26`
- **Detail**: Checkout uses the default credential-persistence behavior. The later dependency installation can run package lifecycle scripts while the workflow's write-capable `GITHUB_TOKEN` remains in `.git/config`. Filtering credentials from the reviewer child process does not remove this checkout credential.
- **Fix**: Set `persist-credentials: false` on checkout; the action uses its explicit API token and does not require Git credentials.
- **Decision**: FIXED in the worktree; not committed.

### F2 — Workflow actions use movable tags

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/review.yml:24,29`
- **Detail**: `actions/checkout` and `actions/setup-node` are referenced by major-version tags in a job with write permissions. A tag can move to different action code after review.
- **Fix**: Pin each action to a verified full commit SHA and retain the version in a comment.
  - Strength: Makes the workflow's privileged action code immutable and reviewable.
  - Tradeoff: Action updates require an intentional SHA refresh.
  - Confidence: HIGH — the workflow grants write permissions and handles a provider key.
  - Blind spot: The existing application CI also uses major-version tags.
- **Decision**: FIXED in the worktree; not committed.

### F3 — Overlapping runs can publish stale reviews

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability
- **Location**: `.github/workflows/review.yml:4-6,13-20`; `reviewer/src/github-review.ts:200-218`
- **Detail**: Update and retry events can run concurrently. The action fetches a diff before the model call and does not verify that the PR head is still the reviewed revision before publishing its comment and labels. An older run can therefore overwrite a newer result.
- **Fix**: Serialize review runs per PR and re-check the PR head SHA before publishing.
  - Strength: Prevents stale runs from overwriting the current review state.
  - Tradeoff: A newer run may wait for a slow model call unless cancellation behavior is chosen carefully.
  - Confidence: HIGH — the workflow permits overlapping events and the action publishes after the model call.
  - Blind spot: The desired cancellation policy for an in-flight review is not specified.
- **Decision**: FIXED in the worktree; added per-PR cancellation and a head-SHA recheck before any comment or label update. Reviewer tests, lint, and typecheck pass; not committed.

### F4 — Comment pagination has no bound

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: `reviewer/src/github-review.ts:223-234`
- **Detail**: The action fetches and retains every comment page before searching for its marked review comment. A PR with a very large comment history can cause unnecessary API calls and memory use.
- **Fix**: Stop searching once the target is found and impose a documented page bound with a visible operational error when exceeded.
- **Decision**: FIXED in the worktree; searches one page at a time, stops on a match, and fails after 10 pages. Documented and tested; not committed.

### F5 — Reviewer child-process I/O has no bounds or timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability
- **Location**: `reviewer/src/github-review.ts:119-130`; `reviewer/src/index.ts:30-39`
- **Detail**: The child process accumulates stdin/stdout/stderr without size limits and is awaited without a timeout. A large diff or a hung provider process can consume excessive memory or leave a workflow running until the runner timeout.
- **Fix**: Bound serialized input and captured output, and terminate the child after a documented timeout while surfacing a clear operational error.
  - Strength: Makes resource use and failure time predictable.
  - Tradeoff: Limits must be selected to avoid rejecting legitimate reviews.
  - Confidence: HIGH — the current process boundary has no configured bounds.
  - Blind spot: Representative diff sizes and an acceptable provider timeout were not measured in this review.
- **Decision**: FIXED in the worktree; enforces 1 MiB input/stdout, 16 KiB stderr, and a 10-minute timeout. Documented and tested; not committed.

### F6 — Any commenter can make the action overwrite their comment

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `reviewer/src/github-review.ts:20-23,236-244`
- **Detail**: The action identifies its comment only by an HTML marker. A commenter can post that marker and cause a later review to replace that comment, even though the commenter is not the bot.
- **Fix**: Include comment author identity in the API representation and update only a marked comment authored by the expected bot.
  - Strength: Prevents the action from replacing user-authored content.
  - Tradeoff: Requires a reliable expected bot identity in addition to the marker.
  - Confidence: HIGH — marker matching currently does not establish authorship.
  - Blind spot: The expected bot identity should be confirmed for the repository's GitHub configuration.
- **Decision**: FIXED in the worktree; only updates marked comments from `github-actions[bot]`. User-marker behavior is tested and documented; not committed.

### F7 — Workflow trust guards lack regression assertions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `.github/workflows/review.yml:15-26`; `reviewer/src/github-review.test.ts:268-315`
- **Detail**: Existing tests cover the action's child-process safety, but do not assert the workflow's fork exclusion, disabled-by-default gate, trusted-base checkout, or minimal permissions. These are critical controls and could regress without making the current reviewer tests fail.
- **Fix**: Add offline workflow-level assertions for the fork guard, exact enable condition, base-SHA checkout, allowed permissions, and forbidden triggers.
- **Decision**: FIXED in the worktree; offline tests assert fork/enable/trusted-checkout/permissions/trigger/concurrency/verdict contracts; not committed.

### F8 — Clean-checkout lint failed at the implementation commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `eslint.config.js`; `src/lib/services/email-service-client.mjs`; `src/lib/services/signature-deliveries.ts:59`
- **Detail**: At reviewed commit `840506a`, a detached clean checkout passed `npx astro check` but `npm run lint` failed with 39 errors. Examples included the project-service parser error for `email-service-client.mjs` and an unsafe return in `signature-deliveries.ts`.
- **Fix**: Commit the minimal lint configuration and source corrections needed for a clean checkout to pass, then rerun the repository checks.
  - Strength: Makes the plan's lint success criterion reproducible in CI rather than dependent on local uncommitted files.
  - Tradeoff: The corrections span files outside the planned reviewer implementation and should be committed as a clearly scoped change.
  - Confidence: HIGH — the failure was reproduced in a detached checkout at the implementation's `HEAD`.
  - Blind spot: The original 39 diagnostics included formatting in other tracked scripts and tests; the correction was isolated and verified from a clean checkout.
- **Decision**: FIXED — committed as `dd4a222`; a detached clean checkout now passes `npx astro check` and `npm run lint`.

### F9 — Requirements documents still name `master`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/requirements.md`; `.github/workflows/requirements.md`
- **Detail**: Both requirements documents retained wording that PRs target `master`, while the implementation plan and review workflow target `main`. The rubric itself was aligned, but the branch-target documentation was inconsistent.
- **Fix**: Clarify whether those requirements should also target `main`, and update the wording if so.
- **Decision**: FIXED in the worktree; updated both requirements documents to target `main`, but not committed.
