# Critical-Path Test Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Bootstrap a test runner (none exists today) and add two critical-path test suites
implementing test-plan.md's rollout Phase 1: a unit suite proving HTML/PowerShell
script-injection is structurally blocked (Risk #3), and a real-RLS integration suite
proving cross-department IDOR is rejected across every department-scoped resource
(Risk #1).

## Starting Point

No Vitest/Jest config exists. Department isolation already works via real Postgres
RLS plus server-derived department ids — there's no app-code check to unit-test
against, so Risk #1 needs real HTTP + real auth. Script-injection is already defended
by `escapeHtml()` (HTML) and Base64 payload encoding (PowerShell) in a single pure
function, `generateSignatureArtifacts()`. `scripts/smoke.mjs` already has working
oracles for both risks but only runs in CI's `smoke` job against a full built app.

## Desired End State

`npm run test:unit` passes locally/in CI with zero external dependencies, proving
injected metacharacters never reach either signature artifact unescaped. `npm run
test:integration`, run against a locally started Supabase + dev/preview server,
passes, proving a second department's session is rejected (404) on every
department-scoped resource. `test-plan.md` §6 names the real files/commands shipped.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Risk #1 execution model | Real HTTP against a running dev/preview server | Avoids Astro virtual-module mocking entirely and exercises the real route+RLS boundary, mirroring smoke.mjs's proven pattern | Plan |
| Server/Supabase lifecycle | Manual/external (`BASE_URL` env, mirrors smoke.mjs) | Zero new orchestration code; Phase 3 wires CI startup anyway | Plan |
| Risk #1 coverage scope | All 5 resources (employees, logo, signatures, deliveries) | Phase 1 becomes a genuine fast local/CI replacement for the IDOR risk, not a partial one | Plan |
| Test file layout | One `vitest.config.ts`, split by include-glob + npm script | One config to maintain; naming convention scales to future phases | Plan |
| Injection fixture set | Exactly the test-plan's named set (`<script>`, `&`, `"`, `` ` ``, `$()`) | Directly satisfies documented response intent; escapeHtml's char class + Base64 alphabet structurally cover the rest | Plan + Research |
| npm script naming | `npm test` = unit; `test:unit` alias; `test:integration` separate | Keeps `npm test` fast/dependency-free, matching convention | Plan |

## Scope

**In scope:**
- Vitest bootstrap (config, path alias, npm scripts)
- Risk #3 unit tests on `generateSignatureArtifacts()`
- Risk #1 integration tests across employees CRUD, logo storage, signature
  generation, and signature-delivery creation
- test-plan.md §6 cookbook + AGENTS.md doc updates

**Out of scope:**
- CI wiring (test-plan.md Phase 3)
- Automating Supabase/server startup for tests
- Risks #2, #4, #5, #6 (Phase 2/3 territory)
- Broader adversarial fixture set beyond the test-plan's named characters

## Architecture / Approach

One `vitest.config.ts` with `@/*` alias resolution, split into a `unit` project
(`src/**/*.unit.test.ts`, no external deps) and an `integration` project
(`tests/integration/**/*.test.ts`, requires `BASE_URL` + running Supabase). The
integration suite ports `scripts/smoke.mjs`'s cookie-jar/HTTP helper into a shared
`tests/integration/support/` module so both the existing smoke test's pattern and the
new suite share one implementation philosophy (real auth, real RLS, no mocking).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap Vitest | Test runner, config, npm scripts, verified via placeholder | Config doesn't correctly separate unit/integration file sets |
| 2. Risk #3 unit tests | Injection fixture suite on `generateSignatureArtifacts()` | Testing only the happy path / not proving Base64 containment structurally |
| 3. Risk #1 integration tests | Cross-department 404 assertions across 5 resources | Accidentally using mocked auth instead of real RLS |
| 4. Docs & cookbook | test-plan.md §6 + AGENTS.md updated with real paths | None — purely descriptive |

**Prerequisites:** Local Supabase CLI available (already used by `scripts/smoke.mjs`
and CI); no new external services.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Assumes the Vitest version chosen cleanly supports a two-project split without
  needing `getViteConfig` — research confirmed neither test touches an Astro/
  Cloudflare virtual module, so this should hold.
- Assumes `supabase/seed.sql`'s four seeded departments remain stable for integration
  test department-pair selection (already relied upon by `scripts/smoke.mjs`).

## Success Criteria (Summary)

- A developer can run `npm run test:unit` with zero setup and get a real signal on
  script-injection regressions.
- A developer with local Supabase running can run `npm run test:integration` and get
  a real signal on cross-department IDOR regressions, for all 5 resources research
  identified.
- `test-plan.md` §6 cookbook no longer says "TBD" for unit/integration/new-endpoint
  patterns.
