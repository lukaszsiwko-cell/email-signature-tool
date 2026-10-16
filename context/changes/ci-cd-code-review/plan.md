# CI/CD Code Review Implementation Plan

## Overview

Build an isolated AI code-review package and a local GitHub composite action, then connect them to a gated pull-request workflow. The reviewer returns the canonical six-score JSON contract and a binding `pass`/`fail` verdict; a `fail` blocks the review job after its comment and labels are updated.

## Current State Analysis

The repository has application CI for `main`, but no executable AI reviewer. The review workflow is a draft that references an unresolved external action; the root composite action invokes a missing `dist/review.js` and does not produce its declared verdict output (`.github/workflows/review.yml:4-30`; `action.yml:17-30`). The existing app CI uses Node 22, while `.nvmrc` declares Node 26.3.0 (`.github/workflows/ci.yml:14-17`; `.nvmrc:1`).

The change requirements define six criteria, each with score endpoints from 1 to 10, but retain a `{{CR_CRITERIA}}` placeholder. The workflow requirements also retain that placeholder. The schema template has matching fields, but its security wording omits explicit privacy and user-safety coverage, and plain `z.number()` does not enforce the score range (`context/changes/requirements.md:7-23`; `.github/workflows/requirements.md:12-16`; `.github/config-templates/m5l2-review-schema.ts.template:14-57`).

## Desired End State

A separately installable reviewer package reads PR title, description, and diff from JSON on standard input and emits a schema-validated review with six integer scores from 1 to 10, a summary, and a binding verdict. The local composite action runs trusted base-branch code, obtains PR data without executing PR code, updates one identifiable summary comment and mutually exclusive result labels, consumes the retry label, and exposes the verdict.

The `main` PR workflow handles `opened`, `synchronize`, and `reopened`, plus an explicit `ai-cr:review` retry. It skips fork PRs and remains disabled by default until an attended cost pilot identifies the production model and verifies the dedicated OpenRouter key's aggregate hard budget. Once enabled, a model `fail` produces a failing review check.

### Key Discoveries:

- `.github/workflows/ci.yml:3-30` — existing application checks target `main`; the review job must remain distinct from app validation.
- `.github/workflows/review.yml:4-30` — the untracked review workflow uses `main` but references a placeholder external action and includes an unselected manual trigger.
- `action.yml:11-31` — the local composite action is a draft with an API-key input and an unimplemented verdict output.
- `.github/config-templates/m5l2-review-schema.ts.template:7-60` — the existing six-field schema and prompt are the basis for the review contract.
- `context/changes/ci-cd-code-review/research.md` — records GitHub fork-secret behavior, OpenRouter's aggregate-only hard budget model, and the unavailable branch-protection status.

## What We're NOT Doing

- Reviewing fork pull requests automatically or using `pull_request_target`.
- Publishing or consuming an external reviewer action.
- Adding Promptfoo evaluations or a broader agent tool suite.
- Changing the application's existing runtime or deployment workflow.
- Treating the model verdict as approval to merge; repository branch protection remains a separate manual configuration.
- Claiming a per-review hard cost cap; OpenRouter enforces the configured key/workspace aggregate budget.

## Implementation Approach

Keep the AI SDK 7 / OpenRouter provider 3 / Zod reviewer and its lockfile under `reviewer/`, using `.nvmrc` for its Node runtime. Use the clarified change requirements as the canonical rubric, align the schema/template and both requirements documents, and test the JSON-in/JSON-out boundary without live model calls. Run an attended, representative cost pilot before configuring the dedicated production key and aggregate budget. Implement the root `action.yml` as the local composite action, then use a `pull_request` workflow that checks out the PR base SHA so local action code comes from the trusted base revision. Pass PR values as structured data rather than interpolating them into shell commands. Keep the workflow's repository-variable gate false until the pilot and budget are verified.

## Critical Implementation Details

The `pull_request` event's default checkout can contain PR-controlled changes, so the workflow must check out `github.event.pull_request.base.sha` before invoking the local action; obtain the diff through the GitHub API rather than executing checked-out PR code. Keep the workflow disabled by default with a repository variable, and only enable it after the attended pilot, dedicated key, production model, and aggregate budget are verified. A workflow skipped for a fork or while disabled is not a passing AI review.

## Phase 1: Build the Isolated Reviewer Contract

### Overview

Create the standalone reviewer package, its ToolLoopAgent entry point and CLI, canonical structured schema, and offline tests. Align the rubric sources so the schema contract is unambiguous before workflow integration.

### Changes Required:

#### 1. Reviewer package and executable

**File**: `reviewer/package.json`, `reviewer/package-lock.json`, `reviewer/tsconfig.json`, `reviewer/src/index.ts`, `reviewer/src/agent.ts`, `reviewer/src/review-schema.ts`, `reviewer/src/prompts/system.ts`

**Intent**: Add an isolated ESM package using AI SDK 7, `@openrouter/ai-sdk-provider` major 3, Zod, and `tsx`, with reusable reviewer exports and a CLI suitable for an attended pilot and the local action. Keep application dependencies and root package scripts independent.

**Contract**: The CLI accepts a JSON object containing `title`, `body`, and `diff` on standard input and emits structured review JSON on standard output. The review has the six canonical score fields, integer values from 1 through 10, `verdict: "pass" | "fail"`, and a Markdown summary. Verify the provider-compatible output schema and enforce score bounds at runtime after generation; include explicit privacy and user-safety scope in the security criterion. Log per-run token and provider cost usage without logging secrets, and surface missing configuration, invalid output, provider errors, and cost metadata clearly.

#### 2. Reviewer tests and package checks

**File**: `reviewer/src/**/*.test.ts`, `reviewer/vitest.config.ts`, `reviewer/package.json`

**Intent**: Verify the review boundary without making network calls, including schema enforcement, CLI input/output, model-response validation, and OpenRouter usage extraction.

**Contract**: Provide package-local `test`, `lint`, and `typecheck` scripts. Tests must cover out-of-range scores, malformed input/output, missing API configuration, and ensuring secrets do not appear in logs.

#### 3. Rubric source alignment

**File**: `context/changes/requirements.md`, `.github/workflows/requirements.md`, `.github/config-templates/m5l2-review-schema.ts.template`

**Intent**: Make the six clarified criteria the single rubric used by the implementation and remove contradictory placeholders from directly related requirements and schema guidance.

**Contract**: Replace both `{{CR_CRITERIA}}` placeholders with the canonical criterion descriptions and their 1/10 endpoints; align the template's security wording with privacy and user-safety scope and keep its provider-compatibility note accurate. Preserve the existing parked criteria and other unrelated requirements.

### Success Criteria:

#### Automated Verification:

- `npm ci --prefix reviewer` installs the isolated package from its lockfile.
- `npm test --prefix reviewer` passes offline schema, CLI, agent-boundary, and usage tests.
- `npm run lint --prefix reviewer` and `npm run typecheck --prefix reviewer` pass.
- Automated schema checks accept only integer scores from 1 through 10 and require all six scores, an allowed verdict, and a summary.

#### Manual Verification:

- A reviewer can inspect the JSON input/output contract and confirm it maps to the six clarified criteria without adding the parked business-alignment or architectural-fit criteria.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase.

## Phase 2: Run the Attended Cost Pilot

### Overview

Use representative changes with human attendance to select the production model and verify the provider's reported usage and cost against OpenRouter's dashboard. Keep automatic workflow execution disabled until the dedicated production key and aggregate hard budget are configured.

### Changes Required:

#### 1. Pilot guidance and usage reporting

**File**: `reviewer/README.md`, `reviewer/src/usage.ts`, `reviewer/src/**/*.test.ts`

**Intent**: Document the attended pilot path and make each run's token and cost information easy to inspect before unattended use.

**Contract**: Document how to provide a representative JSON input, set the API key and candidate model locally without committing secrets, run the reviewer, and compare the returned provider cost and units with the OpenRouter dashboard. The documented budget is an aggregate key/workspace cap, not a per-review limit.

#### 2. Production budget gate

**File**: `.github/workflows/review.yml`, repository configuration documentation

**Intent**: Ensure the later workflow cannot call the model automatically before the pilot has established a model and acceptable aggregate spend limit.

**Contract**: Keep an `AI_REVIEW_ENABLED` repository variable false by default. Document the `OPENROUTER_API_KEY` secret, selected `OPENROUTER_MODEL`, and the operator's manual steps to configure and verify a dedicated key's aggregate hard budget before setting the enable variable to true.

### Success Criteria:

#### Automated Verification:

- Reviewer tests verify provider usage extraction and that usage logs contain no API key or other secret values.

#### Manual Verification:

- Run the reviewer against maintainer-selected representative diffs with an attended key; compare the reported cost and units to the OpenRouter dashboard and record the selected production model.
- Configure a dedicated production key with an aggregate hard budget in OpenRouter; verify the budget and model before enabling automatic reviews.
- Confirm `AI_REVIEW_ENABLED` remains false until the pilot and budget verification are complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before proceeding to the next phase.

## Phase 3: Complete the Local Composite Action

### Overview

Implement the repository-local action to collect PR data safely, run the reviewer, and make the review's comment, labels, retry behavior, and verdict output deterministic.

### Changes Required:

#### 1. Composite action inputs and review execution

**File**: `action.yml`

**Intent**: Replace the missing `dist/review.js` invocation with the isolated package runner and make the action reusable from the repository's workflow.

**Contract**: Accept the PR number and GitHub token, OpenRouter key, and selected model as inputs. Read title, body, and diff from the GitHub API, pass them to the CLI as structured JSON, expose the validated verdict as the action output, and never interpolate PR-controlled text into shell source. Use the checked-out trusted base revision for action code.

#### 2. Comment, labels, and retry lifecycle

**File**: `action.yml`, `reviewer/src/github-review.ts`, `reviewer/src/**/*.test.ts`

**Intent**: Make repeated and manually retried reviews update one PR summary and leave a single unambiguous result label.

**Contract**: Update or create one comment identified by a stable HTML marker and containing the six scores and summary. Remove the opposite result label before applying `ai-cr:passed` or `ai-cr:failed`; create a missing result/retry label with its specified color without rewriting existing label metadata. On the `ai-cr:review` retry event, consume that label so a later retry requires an explicit re-add. Apply the model's `fail` verdict only after the comment and labels are updated. On operational errors, fail visibly without converting the error to a `pass` result or logging secrets.

### Success Criteria:

#### Automated Verification:

- `npm test --prefix reviewer` verifies API interaction, comment upsert, mutually exclusive result labels, retry-label consumption, and verdict output using mocked GitHub responses.
- Action-level tests verify that PR title, body, and diff are passed as data and never evaluated as shell code.
- A `pass` review returns `pass`; a `fail` review still updates its comment and labels before the consuming workflow fails on the output.

## Phase 4: Wire and Verify the PR Workflow

### Overview

Replace the placeholder workflow with a `main`-targeted, explicitly permissioned workflow that invokes the trusted local action, skips forks, honors the cost gate, and treats a model `fail` as a failing check.

### Changes Required:

#### 1. PR event workflow and reviewer test CI

**File**: `.github/workflows/review.yml`, `.github/workflows/ci.yml`

**Intent**: Add the agreed automatic and retry triggers without changing the existing app validation or deployment behavior, and keep the reviewer package continuously testable without live model calls.

**Contract**: Trigger on `opened`, `synchronize`, and `reopened` for PRs targeting `main`, and on `labeled` only when the added label is `ai-cr:review`. Check out `github.event.pull_request.base.sha`, use Node from `.nvmrc`, invoke the root local action, and explicitly grant only `contents: read`, `pull-requests: write`, and `issues: write` as required for checkout, PR data, comments, and labels. Skip fork PRs and require `AI_REVIEW_ENABLED == 'true'` before model execution. Do not use `pull_request_target` or `workflow_dispatch`. Add a separate offline reviewer test job to existing CI.

#### 2. Verdict gate and operator instructions

**File**: `.github/workflows/review.yml`, `reviewer/README.md`

**Intent**: Make the AI result visible as a PR check while documenting what an operator must configure and what the result means.

**Contract**: After the action completes its comment and label updates, fail the review job when its output verdict is `fail`; operational errors also fail the job. Document the dedicated `OPENROUTER_API_KEY` secret, `OPENROUTER_MODEL`, default-disabled `AI_REVIEW_ENABLED` variable, retry label usage, fork exclusion, aggregate budget caveat, and the manual branch-protection step for requiring the check.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, and `npm run build` pass for the existing application.
- `npm ci --prefix reviewer`, `npm test --prefix reviewer`, `npm run lint --prefix reviewer`, and `npm run typecheck --prefix reviewer` pass without live model credentials.
- The workflow and local action contain only the agreed PR triggers, trusted base checkout, fork and enable guards, minimal required permissions, local action reference, and fail-verdict gate.

#### Manual Verification:

- With automatic reviews still disabled, verify the workflow configuration cannot invoke the model for a fork or an unapproved repository variable value.
- After the cost pilot and budget gate are approved, test same-repository PRs for `opened`/update behavior, pass and fail verdicts, one-comment updates, mutually exclusive labels, and retry by adding `ai-cr:review`.
- Confirm fork PRs do not expose the OpenRouter secret or receive automatic reviews, and verify the review check is configured as required in branch protection if that is the repository's desired merge policy.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual verification was successful before considering the change complete.

## Testing Strategy

### Unit Tests:

- Validate every rubric score field, integer range, verdict enum, and required summary.
- Exercise the CLI's JSON input/output, invalid inputs, provider failures, and usage reporting with mocked model responses.
- Test comment upsert, label exclusivity, retry-label consumption, and action output with mocked GitHub API calls.

### Integration Tests:

- Run the isolated reviewer test suite in the existing CI as an offline job.
- Use a same-repository PR after the manual cost gate is enabled to verify real GitHub API permissions and end-to-end action behavior.

### Manual Testing Steps:

1. Run an attended cost pilot on representative diffs and reconcile each reported cost with the OpenRouter dashboard.
2. Confirm a successful same-repository review updates one comment, applies only `ai-cr:passed`, and reports `pass`.
3. Confirm a failing review updates the same comment, applies only `ai-cr:failed`, and fails the review check.
4. Add `ai-cr:review` to a same-repository PR and confirm it is consumed and triggers one new review.
5. Confirm fork PRs and disabled configuration skip model execution, and verify branch-protection requirements separately.

## Performance Considerations

Model calls are network-bound and incur cost; the attended pilot establishes the model and informs the aggregate budget. Do not truncate a diff silently: surface model/provider context or size errors as operational failures. Concurrent workflow cancellation or per-review cost limits are not represented as provider guarantees.

## Migration Notes

No application database migration is needed. Existing untracked review drafts should be completed in place where possible; replace the external action reference and missing bundle rather than adding a second action definition. Add the dedicated secret and repository variables only after the attended pilot.

## References

- Related research: `context/changes/ci-cd-code-review/research.md`
- Canonical rubric: `context/changes/requirements.md`
- Workflow requirements: `.github/workflows/requirements.md`
- Reviewer schema template: `.github/config-templates/m5l2-review-schema.ts.template`
- Agent SDK setup: `.github/prompts/m5l2-agent.md`
- Existing CI: `.github/workflows/ci.yml`
- Review workflow draft: `.github/workflows/review.yml`
- Local action draft: `action.yml`
- Runtime version: `.nvmrc`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.github/skills/10x-plan/references/progress-format.md`.

### Phase 1: Build the Isolated Reviewer Contract

#### Automated

- [x] 1.1 `npm ci --prefix reviewer` installs the isolated package from its lockfile.
- [x] 1.2 `npm test --prefix reviewer` passes offline schema, CLI, agent-boundary, and usage tests.
- [x] 1.3 `npm run lint --prefix reviewer` and `npm run typecheck --prefix reviewer` pass.
- [x] 1.4 Automated schema checks accept only integer scores from 1 through 10 and require all six scores, an allowed verdict, and a summary.

#### Manual

- [x] 1.5 Confirm the contract matches the clarified six criteria and excludes the parked criteria.

### Phase 2: Run the Attended Cost Pilot

#### Automated

- [ ] 2.1 Reviewer tests verify provider usage extraction and that usage logs contain no API key or other secret values.

#### Manual

- [ ] 2.2 Run attended representative reviews and reconcile reported cost and units with the OpenRouter dashboard.
- [ ] 2.3 Configure and verify the dedicated key, production model, and aggregate hard budget before enabling reviews.
- [ ] 2.4 Confirm `AI_REVIEW_ENABLED` remains false until the pilot and budget verification are complete.

### Phase 3: Complete the Local Composite Action

#### Automated

- [ ] 3.1 `npm test --prefix reviewer` verifies API interaction, comment upsert, mutually exclusive result labels, retry-label consumption, and verdict output.
- [ ] 3.2 Action-level tests verify PR data is passed as data and never evaluated as shell code.
- [ ] 3.3 A `fail` verdict still updates its comment and labels before the consuming workflow fails on the output.

### Phase 4: Wire and Verify the PR Workflow

#### Automated

- [ ] 4.1 `npm run lint`, `npx astro check`, and `npm run build` pass for the existing application.
- [ ] 4.2 Reviewer install, test, lint, and typecheck commands pass without live model credentials.
- [ ] 4.3 Workflow and action satisfy the agreed trigger, trusted-checkout, fork, enable-gate, permission, local-action, and verdict-gate contracts.

#### Manual

- [ ] 4.4 Verify the disabled workflow and fork guard prevent model execution before enabling automation.
- [ ] 4.5 Verify same-repository pass/fail, comment updates, result labels, and retry behavior after the cost gate is approved.
- [ ] 4.6 Verify fork secret exclusion and configure required branch protection if desired.
