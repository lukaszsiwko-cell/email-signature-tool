---
date: 2026-10-16T07:45:23.477+02:00
researcher: GitHub Copilot CLI
git_commit: 6bdc5502dbdf9d42406471d26b9158a4572774f4
branch: main
repository: lukaszsiwko-cell/email-signature-tool
topic: "Research constraints for a PR code review workflow"
tags: [research, github-actions, code-review]
status: complete
last_updated: 2026-10-16
last_updated_by: GitHub Copilot CLI
last_updated_note: "Compared the clarified change-level rubric with the workflow requirements and reviewer schema template."
---

# Research: Constraints for a PR code review workflow

**Date**: 2026-10-16T07:45:23.477+02:00  
**Researcher**: GitHub Copilot CLI  
**Git Commit**: 6bdc5502dbdf9d42406471d26b9158a4572774f4  
**Branch**: main  
**Repository**: lukaszsiwko-cell/email-signature-tool

## Research Question

What is already in place, and what must be resolved to introduce a CI workflow for pull request code reviews?

## Summary

The repository already has GitHub Actions for application validation, but the code-review automation is currently a draft in untracked files, not a runnable workflow. The draft names the intended review inputs and effects, while its action reference contains a literal `<sha>` placeholder and the local composite action points to a reviewer bundle that is absent from the inspected paths. Its declared verdict output is not produced by the action steps (`.github/workflows/review.yml:26-30`; `action.yml:17-30`).

The existing CI workflow targets `main`; the workflow requirements and README refer to `master` (`.github/workflows/ci.yml:3-7`; `.github/workflows/requirements.md:1-4`; `README.md:254-257`). Settle the target branch before finalizing triggers. Six criteria and explicit score endpoints are now described in the change-level requirements, but the workflow requirements still contain a criteria placeholder and the relation to the schema template needs to be settled (`context/changes/requirements.md:14-23`; `.github/workflows/requirements.md:12-16`). Verdict policy, PR comment/label permissions, retry behavior, secret availability for fork PRs, and the local-versus-external action source also remain unresolved.

## Detailed Findings

### Existing CI and runtime

- In the inspected `.github/workflows/ci.yml`, the `ci` and `smoke` jobs run on pushes and pull requests targeting `main` (`.github/workflows/ci.yml:3-12,35-55`). The `ci` job installs dependencies, runs `astro sync`, lint, `astro check`, and build; the build receives `SUPABASE_URL` and `SUPABASE_KEY` from repository secrets (`.github/workflows/ci.yml:14-30`). The `smoke` job starts local Supabase, builds and serves a production preview, then runs the HTTP smoke test (`.github/workflows/ci.yml:35-55`).
- The project exposes unit, integration, and smoke scripts. Integration tests require `BASE_URL`; the smoke script also uses a local HTTP base URL (`package.json:7-16`; `vitest.config.ts:7-13,27-36`; `scripts/smoke.mjs:1-5`). The integration suite exercises cross-department data isolation over HTTP (`tests/integration/cross-department-isolation.test.ts:54-112`). The inspected CI workflow does not invoke the unit-test script; its existing validation steps are listed above.
- The workflow sets up Node 22 (`.github/workflows/ci.yml:16`), while the repository `.nvmrc` specifies 26.3.0 and the review draft uses that file (`.nvmrc:1`; `.github/workflows/review.yml:18-21`). Choose whether the review job should match the existing CI runtime or the repository's declared local runtime.
- Astro builds for server rendering with the Cloudflare adapter (`astro.config.mjs:10-11,24`). The build's declared server environment includes Supabase, email, and app URL values (`astro.config.mjs:26-32`); the existing CI build specifically consumes the two Supabase secrets above. Deployment is handled through Cloudflare Workers Builds rather than the GitHub Actions workflow (`context/changes/deployment/deployment-plan.md:7-18`; `README.md:222-224`).

### Review workflow and action draft

- The draft requirements describe a composite action, PR title and diff inputs, an optional description input due to cost concerns, scored criteria, a summary comment, pass/fail labels, and retry on an `ai-cr:review` label (`.github/workflows/requirements.md:1-30`). The criteria slot is still the literal `{{CR_CRITERIA}}` placeholder (`.github/workflows/requirements.md:12-16`).
- The change-level requirements now define six criteria, each with descriptions of scores 1 and 10 (`context/changes/requirements.md:14-21`). The six rubric areas match the template's six score fields by name, and the template also gives field-level score descriptions (`.github/config-templates/m5l2-review-schema.ts.template:17-57`). The wording differs in scope: the change-level security-and-safety criterion explicitly includes privacy and user-safety risks, while the template's `securitySafety` description names vulnerabilities, secret leakage, and unsafe trust in external data (`context/changes/requirements.md:21`; `.github/config-templates/m5l2-review-schema.ts.template:52-57`). Both requirements files still contain `{{CR_CRITERIA}}` placeholders (`context/changes/requirements.md:23`; `.github/workflows/requirements.md:16`).
- In the inspected schema template, each score is a plain `z.number()` and the comment says the 1–10 range is carried in field descriptions and the prompt, not numeric schema bounds (`.github/config-templates/m5l2-review-schema.ts.template:14-15,17-57`). Thus the template communicates the range to the model but does not encode that range as a numeric bound in this Zod schema.
- The schema template defines six scored criteria and a pass/fail verdict with a summary; the associated agent prompt proposes a future AI SDK 7/OpenRouter implementation (`.github/config-templates/m5l2-review-schema.ts.template:1-66`; `.github/prompts/m5l2-agent.md:8-18`). These are contracts or setup instructions, not an executable reviewer.
- The draft workflow triggers on PRs targeting `main` and `workflow_dispatch`, checks out the repository, installs dependencies, then invokes `twoj-zespol/ai-reviewer@<sha>` with an LLM API key (`.github/workflows/review.yml:4-30`). The `<sha>` is a placeholder. The requirements' `master` target disagrees with this workflow and the existing CI.
- The root `action.yml` is a separate composite-action draft. It declares an API-key input and a `verdict` output mapped to `steps.agent.outputs.verdict`, then invokes `dist/review.js` (`action.yml:12-30`). The review workflow references the external action rather than this local action (`.github/workflows/review.yml:26-30`). The action steps do not declare or write a verdict output, and the inspected `dist/` directory does not contain `dist/review.js` (`action.yml:20,26-30`).
- In the inspected `src/`, `scripts/`, and `dist/` paths, no executable reviewer implementation was found. The root package manifest contains application scripts and dependencies, but no reviewer build script or AI SDK/OpenRouter dependency (`package.json:5-55`). The reviewer artifacts and root `action.yml` are untracked in the observed worktree; the existing application source and package files are tracked.
- The expected PR comment, pass/fail label updates, and retry-on-label handling are stated in the requirements file but have no implementation in the inspected workflow/action draft (`.github/workflows/requirements.md:23-30`; `.github/workflows/review.yml:4-30`; `action.yml:23-30`). The workflow also does not consume the declared verdict as a CI gate. It does not declare a GitHub token input, explicit permissions, or a label-event trigger in its inspected contents (`.github/workflows/review.yml:1-30`).

### Historical context

- The testing change established fast unit tests separately from real-server integration tests, with integration tests using HTTP/RLS rather than framework mocks (`context/changes/testing-critical-path-coverage/plan-brief.md:20-28,35-40`). It kept CI wiring and automated Supabase/server startup outside that change's scope (`context/changes/testing-critical-path-coverage/plan-brief.md:45-55`).
- The deployment plan says GitHub Actions validate the app while Cloudflare Workers Builds handle deployment (`context/changes/deployment/deployment-plan.md:7-18`). This is consistent with the current README deployment description (`README.md:222-224`).
- The active code-review change has no prior research or plan artifact; its `change.md` records only the intent to introduce the workflow (`context/changes/ci-cd-code-review/change.md:1-12`).

## Architecture Insights

- Keep the code-review job distinct from application validation: the current CI validates/builds the Astro application and separately exercises its HTTP surface, while review requirements describe model-based PR feedback (`.github/workflows/ci.yml:9-55`; `.github/workflows/requirements.md:1-30`).
- The draft needs one consistent action ownership model. Either publish/use a pinned external action after its implementation exists, or invoke a local action that has a built reviewer bundle. The current workflow and local composite action are not connected (`.github/workflows/review.yml:26-30`; `action.yml:23-30`).
- PR comments and labels require an explicitly designed GitHub API permission/token path. The draft currently supplies an LLM API key but does not specify that GitHub API contract (`.github/workflows/review.yml:26-30`; `action.yml:11-31`).

## Code References

- `.github/workflows/ci.yml:3-30` — existing push/PR validation and build secret usage.
- `.github/workflows/ci.yml:35-55` — local Supabase and production-preview smoke job.
- `.github/workflows/requirements.md:1-30` — intended review inputs, criteria slot, effects, and retry behavior.
- `context/changes/requirements.md:14-23` — change-level criterion descriptions, scoring endpoints, and remaining placeholder.
- `.github/workflows/review.yml:4-30` — draft review workflow triggers, setup, and action reference.
- `action.yml:11-31` — local composite-action inputs, output mapping, and runner command.
- `.github/config-templates/m5l2-review-schema.ts.template:7-60` — structured review schema, prompt, and score descriptions.
- `package.json:5-55` — available application scripts and declared dependencies.
- `astro.config.mjs:10-32` — Cloudflare SSR and server environment schema.
- `context/changes/testing-critical-path-coverage/plan-brief.md:20-63` — prior testing scope and CI-wiring boundary.
- `context/changes/deployment/deployment-plan.md:7-18` — deployment ownership decision.

## Related Research

- `context/changes/testing-critical-path-coverage/research.md`

## Open Questions

- Is `main` or `master` the intended PR target? The existing CI and workflow draft use `main`; the requirements and README use `master`.
- Will the reviewer be implemented and versioned in this repository or in the external `twoj-zespol/ai-reviewer` repository? The current action reference is unresolved and the local reviewer bundle is absent.
- Should the change-level rubric be canonical and replace both `{{CR_CRITERIA}}` placeholders, and should the schema explicitly cover privacy and user-safety risks as described there?
- Should scores outside 1–10 be rejected programmatically, given the current schema uses plain `z.number()` fields?
- Should PR descriptions be part of the model input despite the noted cost tradeoff? How will the reviewer obtain the title, description, and correct PR diff?
- What GitHub permissions and token source will allow comments and labels? What is the intended behavior when `LLM_PROVIDER_API_KEY` is unavailable, including for fork PRs?
- Should retries be driven by a label event, and how should that interact with the current `workflow_dispatch` trigger and duplicate review prevention?
- Should the review job use Node 22 to match current CI, or the Node 26.3.0 version in `.nvmrc`?
- Should a failed review be an advisory result or a required PR check?

## Follow-up Findings (2026-10-16)

This follow-up supersedes the earlier open question about whether the six criteria had been specified: `context/changes/requirements.md:14-21` now names all six and gives each criterion endpoints for scores 1 and 10. It does not remove the workflow requirements' `{{CR_CRITERIA}}` placeholder, and the change-level requirements file also retains that placeholder after the new rubric (`.github/workflows/requirements.md:16`; `context/changes/requirements.md:23`). The schema template's six fields correspond by name, but its security-and-safety description does not explicitly name privacy or user-safety, and its numeric schema fields do not enforce the stated range (`.github/config-templates/m5l2-review-schema.ts.template:14-15,17-57`). Whether the change-level rubric supersedes both placeholders and whether to align or validate the schema are planning decisions, not resolved implementation changes.
