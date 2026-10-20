# CI/CD Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

This change adds a structured AI code reviewer to pull requests targeting `main`. It returns six 1–10 scores, a concise comment, and a binding `pass`/`fail` verdict; a failed verdict blocks the review check. Automation stays disabled until an attended pilot validates provider cost and a dedicated OpenRouter key has an aggregate hard budget.

## Starting Point

Application validation already runs in `.github/workflows/ci.yml`, but the AI review workflow and root composite action are incomplete drafts: the workflow references a placeholder external action, while the local action points at a missing reviewer bundle and does not return its declared verdict. The six criteria are clarified in `context/changes/requirements.md`; both requirements documents still contain a criteria placeholder.

## Desired End State

A standalone, testable reviewer package accepts PR title, description, and diff as structured input and emits validated JSON. A trusted local action updates one review comment, mutually exclusive result labels, consumes the retry label, and exposes the verdict. The `main` PR workflow handles new, updated, reopened, and explicitly retried same-repository PRs, while skipping forks and remaining default-disabled until the cost gate is approved.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Action ownership | Maintain a local composite action | Keeps the workflow and reviewer implementation together instead of relying on an unresolved external action reference. | Plan |
| Reviewer architecture | Isolated AI SDK 7 / OpenRouter provider 3 package | Separates reviewer dependencies from the Astro application and follows the SDK direction in the repo prompt. | Research / Plan |
| Rubric | Six clarified criteria with integer scores 1–10 | The change requirements provide score endpoints, and the structured schema remains the contract for the verdict. | Research / Plan |
| PR target and events | `main`; opened, synchronize, reopened, and `ai-cr:review` label | Aligns with existing CI and provides automatic updates plus an explicit retry path. | Plan |
| PR data | Title, description, and diff | Preserves the approved review context while passing untrusted PR content as data. | Plan |
| Verdict behavior | `fail` fails the review job after comment and label updates | Makes the model's verdict a blocking check without losing the review feedback. | Plan |
| Fork handling | Skip automatic AI reviews for fork PRs | Fork workflows do not receive repository secrets and should not run model calls. | Research / Plan |
| Runtime | Use `.nvmrc` (Node 26.3.0) for the reviewer workflow | Uses the repository's declared runtime for the isolated reviewer package. | Research / Plan |
| Cost control | Attended pilot, then dedicated OpenRouter key with aggregate hard budget | OpenRouter's hard spend controls are aggregate key/workspace limits, not per-review caps. | Research / Plan |
| Automation gate | `AI_REVIEW_ENABLED` is false until pilot and budget are verified | Prevents an unbudgeted model call when the workflow is first merged. | Plan |
| Branch protection | Configure the review check manually if desired | Live branch-protection status could not be verified in the planning session. | Research |

## Scope

**In scope:** Isolated reviewer and offline tests; canonical schema/rubric alignment; attended usage and cost pilot; local composite action; PR comment and label lifecycle; retry label; `main` workflow; fork and cost gates; offline reviewer CI job; operator and branch-protection instructions.

**Out of scope:** Fork PR model reviews, `pull_request_target`, an external action, Promptfoo evaluations, application/deployment changes, a per-review hard cost cap, and automatic merge approval.

## Architecture / Approach

The isolated reviewer reads title, body, and diff as JSON from standard input, calls an AI SDK ToolLoopAgent through OpenRouter, validates the six scores and verdict, and emits JSON plus redacted usage information. The workflow checks out the PR base SHA, runs the local composite action with narrowly scoped write permissions, and applies the result after updating the comment and labels. The workflow's repository-variable gate remains off until the operator completes the attended cost pilot and configures the dedicated aggregate-budgeted key.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Build the Isolated Reviewer Contract | Reusable reviewer package, canonical schema, offline tests, aligned rubric sources | Provider structured-output support and score-bound validation |
| 2. Run the Attended Cost Pilot | Verified model usage/cost and a configured dedicated aggregate budget | Actual provider cost or units differ from expectations |
| 3. Complete the Local Composite Action | Safe PR data handling, one comment, exclusive labels, retry lifecycle, verdict output | GitHub API permission or idempotency errors |
| 4. Wire and Verify the PR Workflow | Gated `main` PR automation, fork exclusion, blocking verdict, manual setup guidance | Workflow trust boundary or repository configuration is incorrect |

**Prerequisites:** Repository write access; OpenRouter access for the attended pilot; a same-repository test PR; ability to configure repository secrets/variables and, if desired, branch protection.
**Estimated effort:** Four implementation phases plus an attended pilot and same-repository end-to-end verification.

## Open Risks & Assumptions

- The exact model and aggregate budget value are selected during the attended pilot; OpenRouter's cap is not per review.
- Automatic reviews intentionally omit fork PRs; those require a separate manual review path.
- Provider context/size errors must fail visibly; the reviewer must not silently truncate a diff.
- A `pass` verdict is only a review check result, not an automatic approval or merge.
- Repository branch protection was not inspected; making the check required remains a manual repository setting.

## Success Criteria (Summary)

- A schema-validated reviewer runs offline tests and produces six bounded scores, a summary, a verdict, and redacted usage data.
- Same-repository PRs get one updated review comment, mutually exclusive result labels, explicit retry behavior, and a failing check for a `fail` verdict.
- Forks and default-disabled automation never call the model; automatic use is enabled only after the attended pilot and aggregate budget are verified.
