# Critical-Path Test Coverage Implementation Plan

## Overview

Bootstrap a Vitest test runner for this project (which has none today) and add two
critical-path test suites that implement rollout Phase 1 of
`context/foundation/test-plan.md` §3 ("Critical-path coverage"): a unit suite that
proves HTML/PowerShell script-injection is structurally impossible (Risk #3), and a
real-RLS integration suite that proves cross-department IDOR is rejected across every
department-scoped resource (Risk #1).

## Current State Analysis

- No test runner exists: `package.json` has no Vitest/Jest dependency, config, or
  script (`package.json:5-13,39-57`).
- Risk #1 (cross-department IDOR) is enforced entirely by real Postgres RLS policies
  keyed on `profiles.department_id` joined to `auth.uid()`, plus server-derived
  department ids in the service layer — no application code ever compares a
  client-supplied department id (`src/middleware.ts:4` gates authentication only, not
  department scope). A mocked-auth test would not exercise this boundary; only a real
  RLS-backed request does.
- Risk #3 (script injection) is fully handled by a single pure function,
  `generateSignatureArtifacts()` (`src/lib/services/signatures.ts:186-200`): HTML
  fields are run through `escapeHtml()` (`signatures.ts:12-27`), and the PowerShell
  installer never interpolates employee data as source — it Base64-encodes the
  already-escaped HTML and embeds only the Base64 string in a single-quoted literal
  (`signatures.ts:52-56`), whose alphabet (`A-Za-z0-9+/=`) cannot contain PowerShell
  metacharacters.
- `scripts/smoke.mjs` already contains working HTTP-level oracles for both risks
  (cross-department `404`s; a `<script>`/`&` escaping fixture), but only runs in CI's
  `smoke` job against a full built-and-previewed app — it is not a fast local/CI
  unit+integration gate.
- Route handlers (e.g. `src/pages/api/employees/[id].ts`) import `astro:env/server`
  indirectly via `@/lib/supabase`; `src/lib/services/signatures.ts` imports neither
  Astro nor Cloudflare virtual modules, so it can run under plain Node-mode Vitest.

## Desired End State

Running `npm run test:unit` locally or in CI (no external dependencies) passes a unit
suite that proves injected HTML/PowerShell metacharacters in employee fields never
reach either generated artifact unescaped/unencoded. Running `npm run test:integration`
against a locally running `supabase start` + `astro dev`/`preview` server (the same
precondition `scripts/smoke.mjs` already assumes) passes an integration suite that
proves a second department's session cannot read, write, or delete the first
department's employees, department logo, generated signatures, or signature
deliveries. `context/foundation/test-plan.md` §6 cookbook sections name the real file
paths and commands this phase ships.

### Key Discoveries:

- `src/lib/services/signatures.ts:186-200` is the correct and only unit-test boundary
  for Risk #3 — no mocking required.
- `src/middleware.ts:4` (`PROTECTED_ROUTES = ["/dashboard", "/employees"]`) confirms
  department isolation is never checked in application code, which is why Risk #1
  requires a real-RLS integration test, not a unit test with a mocked Supabase client.
- `scripts/smoke.mjs`'s cookie-jar (`makeJar()`) and `request()` helper
  (`scripts/smoke.mjs:16-51`) is a proven, dependency-free pattern for multi-user HTTP
  integration testing against this app and is the pattern this plan ports rather than
  reinvents.

## What We're NOT Doing

- Not wiring any test command into CI — that is test-plan.md §3 Phase 3's job.
- Not automating `supabase start` / server startup for integration tests — this phase
  mirrors `scripts/smoke.mjs`'s existing "bring your own running server" contract via
  a `BASE_URL` environment variable.
- Not testing via Astro's Container API or in-process route-handler invocation — all
  Risk #1 coverage goes through real HTTP to a running server.
- Not covering Risk #2 (one-time link lifecycle), Risk #4 (logo-URL exclusion from
  artifacts), Risk #5 (redemption brute force), or Risk #6 (relay-failure visibility)
  — those belong to rollout Phases 2 and 3.
- Not adding broader adversarial injection fixtures (e.g. `'`, `>`, `\`, null bytes)
  beyond the test-plan's named set (`<script>`, `&`, `"`, `` ` ``, `$()`) — `escapeHtml`'s
  fixed character class and Base64's fixed alphabet already structurally cover the
  rest, confirmed by research.
- Not reconciling the pre-existing `.nvmrc` (`26.3.0`) vs. CI (`22`) Node version
  mismatch — flagged by research as out of scope for this phase.

## Implementation Approach

Bootstrap Vitest with a single config file that resolves the `@/*` path alias and
splits unit vs. integration tests by include-glob, so one config serves both npm
scripts without needing Astro-aware Vite config (neither test touches an Astro/
Cloudflare virtual module). Port `scripts/smoke.mjs`'s cookie-jar/request helper into
a reusable integration-test fixture module rather than duplicating it inline, since
both the existing smoke test and the new integration suite now express the same
"multi-user HTTP session" need.

## Phase 1: Bootstrap Vitest

### Overview

Install Vitest, add a config that resolves `@/*` and splits unit/integration test
discovery, and wire npm scripts, verified with a trivial placeholder test before any
real test logic is written.

### Changes Required:

#### 1. Vitest dependency and config

**File**: `package.json`

**Intent**: Add Vitest as a dev dependency and define `test`, `test:unit`, and
`test:integration` scripts. `test` and `test:unit` are the same command (unit tests
only, no external dependencies); `test:integration` requires `BASE_URL` to point at a
running server plus local Supabase.

**Contract**: New npm scripts:

```json
"test": "vitest run --project unit",
"test:unit": "vitest run --project unit",
"test:integration": "vitest run --project integration"
```

(Exact script bodies may use `vitest run <glob>` instead of `--project` if the chosen
Vitest version's workspace/project syntax differs — the contract is that `test` and
`test:unit` run only files under `src/**/*.unit.test.ts`, and `test:integration` runs
only files under `tests/integration/**/*.test.ts`.)

#### 2. Vitest config

**File**: `vitest.config.ts` (new)

**Intent**: Single config resolving the `@/*` alias to `./src/*` (matching
`tsconfig.json:9-11`), with two named projects/workspaces — `unit` (`include:
["src/**/*.unit.test.ts"]`, Node environment) and `integration` (`include:
["tests/integration/**/*.test.ts"]`, Node environment, longer default timeout to
tolerate real network calls to local Supabase/the dev server).

**Contract**: Exports a Vitest config whose `resolve.alias` includes `{ "@": path.resolve(__dirname, "./src") }`, and whose test configuration defines the two named projects above so `vitest run --project unit` and `vitest run --project integration` each run only their own file set.

#### 3. Placeholder verification test

**File**: `src/lib/services/__vitest-bootstrap.unit.test.ts` (new, temporary)

**Intent**: A trivial `expect(1 + 1).toBe(2)`-style test proving the runner, config,
and `@/*` alias resolution all work end-to-end before Phase 2 adds real assertions.
Delete this file at the end of Phase 1 once Phase 2's real unit test exists and passes
under the same config (do not leave a placeholder test in the final suite).

**Contract**: Must pass under `npm run test:unit` with zero config errors, including
one import through the `@/*` alias (e.g. `import type { EmployeeDTO } from "@/types"`)
to prove alias resolution, not just that Vitest itself runs.

### Success Criteria:

#### Automated Verification:

- `npm install` completes with Vitest added to `devDependencies`
- `npm run test:unit` passes (placeholder test green, including the `@/*` alias import)
- `npm run lint` passes (no new lint errors from the added config/script files)

#### Manual Verification:

- Running `npm run test:integration` without `BASE_URL` set fails fast with a clear,
  readable error (not a cryptic network timeout) — confirms the integration project is
  wired even though Phase 1 has no integration tests yet

---

## Phase 2: Risk #3 unit tests — script-injection escaping

### Overview

Unit-test `generateSignatureArtifacts()` against the test-plan's named adversarial
fixture set, proving HTML escaping and PowerShell Base64 containment hold for every
employee text field that reaches either artifact.

### Changes Required:

#### 1. Escaping/injection unit tests

**File**: `src/lib/services/signatures.unit.test.ts` (new)

**Intent**: For each of `firstName`, `lastName`, `position`, and `phone`, construct an
`EmployeeDTO` fixture where that field contains each of the test-plan's named
characters/payloads (`<script>alert(1)</script>`, `&`, `"`, `` ` ``, `$()`) — reusing
the exact `scripts/smoke.mjs` fixture values (`"Smoke <script>alert(1)</script>"`,
`"Tester & Support"`) where they already exist, and adding new fixtures for `"`,
`` ` ``, and `$()` per the test-plan's Risk Response Guidance gap research identified.
Assert, for each fixture: (a) `outlookHtml` contains the escaped entity form and never
the raw metacharacter outside of entity-encoded form; (b) `thunderbirdInstaller`
contains no raw occurrence of the injected payload substring anywhere outside its
Base64-encoded blob (decode the Base64 segment between
`[System.Convert]::FromBase64String('...')` and assert the decoded text equals the
expected escaped HTML, structurally proving no occurrence is smuggled in as literal
PowerShell source).

**Contract**: Test boundary is the exported `generateSignatureArtifacts(employee, logo)` — no internal helper (`escapeHtml`, `encodeBase64`) is imported or tested directly, since the plan's unit of behavior is the public function's output contract. Also cover the `logo: null` case (no `<img>` tag emitted) and a clean non-adversarial fixture as a control case, so escaping assertions have a contrasting baseline.

#### 2. Delete the Phase 1 placeholder

**File**: `src/lib/services/__vitest-bootstrap.unit.test.ts` (delete)

**Intent**: Remove the temporary bootstrap-verification test now that a real unit test
exists and exercises the same config path.

**Contract**: File removed; `npm run test:unit` continues to pass with only real tests remaining.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes, including all fixture/field combinations from the named
  set across all four employee fields
- `npm run lint` passes

#### Manual Verification:

- Temporarily reintroduce an unescaped interpolation in `createHtml()` (e.g. remove
  one `escapeHtml()` call) and confirm the new unit test fails with a clear assertion
  message identifying the offending field, then revert the change — confirms the test
  actually detects a regression rather than passing vacuously

---

## Phase 3: Risk #1 integration tests — cross-department IDOR

### Overview

Add a shared HTTP+auth test helper (ported from `scripts/smoke.mjs`'s cookie-jar/
request pattern) and an integration suite asserting that a second department's
authenticated session is rejected (404 or equivalent) when it attempts to read,
write, generate, or create any of the five department-scoped resources the research
identified: employees (list/get/update/delete), department logo storage, generated
signatures, and signature-delivery creation.

### Changes Required:

#### 1. Shared HTTP+auth test fixture

**File**: `tests/integration/support/http-client.ts` (new)

**Intent**: Port `scripts/smoke.mjs`'s `makeJar()` and `request()` functions
(`scripts/smoke.mjs:16-51`) into a reusable TypeScript module so both this suite and
any future integration phase (Phase 2) share one HTTP/cookie-jar implementation
instead of each hand-rolling fetch+cookie logic. Read `BASE_URL` from
`process.env.BASE_URL`, defaulting to `http://localhost:4321` exactly as
`scripts/smoke.mjs` does, and fail with a clear, actionable error message (naming the
expected `supabase start` + dev/preview server precondition) if the base URL is
unreachable before any test runs.

**Contract**: Exports a `request(path, options)` function with the same per-jar cookie
behavior as `scripts/smoke.mjs`'s version (named jars, automatic `Set-Cookie`
capture/expiry), plus a `fetchSeededDepartments()` helper that parses the signup
page's `<option value="...">` department list exactly as `scripts/smoke.mjs:62-66`
does — this keeps the integration suite from ever hardcoding a department id.

#### 2. Test-user provisioning helper

**File**: `tests/integration/support/test-users.ts` (new)

**Intent**: A helper that signs up two fresh users via real `POST /api/auth/signup`
calls (one per seeded department, using a timestamp-suffixed unique email per the
project's test-independence convention), signs each in via `POST /api/auth/signin`,
and returns their respective cookie-jar names plus each user's created employee id —
so each integration test can act as "department A" and "department B" without manual
setup duplicated per test.

**Contract**: Returns `{ departmentA: { jar, employeeId }, departmentB: { jar, employeeId } }` (or equivalent), where each employee was created via a real `POST /api/employees` call under that department's own session — never inserted directly into the database, so the test exercises the exact same creation path production traffic uses.

#### 3. Cross-department isolation tests

**File**: `tests/integration/cross-department-isolation.test.ts` (new)

**Intent**: Using the fixtures above, assert for each of the five resources that
department B's session cannot act on department A's data:

- `GET /api/employees` (list) never includes department A's employee
- `PUT /api/employees/{deptA-employee-id}` returns 404
- `DELETE /api/employees/{deptA-employee-id}` returns 404
- `POST /api/employees/{deptA-employee-id}/signatures` returns 404
- `POST /api/employees/{deptA-employee-id}/signature-deliveries` returns 404
- Department logo storage: after department A uploads a logo
  (`PUT /api/departments/logo`), department B's own `GET`/`PUT`/`DELETE` logo calls
  never expose or affect department A's logo key (per the Storage RLS boundary
  `(storage.foldername(name))[1]::uuid = profiles.department_id`) — assert department
  B's own logo workflow succeeds independently and leaves department A's logo
  unaffected (check via department A's own session) after department B's logo
  operations.

**Contract**: Each assertion uses real authenticated HTTP calls through the two
sessions provisioned in `test-users.ts` — no mocked `auth.uid()`, no service-role
client, and no direct database access bypassing RLS. Tests must clean up (delete)
only the resources they created, under their own authenticated session, so repeated
runs don't accumulate orphaned employees — following `scripts/smoke.mjs`'s existing
cleanup pattern.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes against a locally running `supabase start` +
  `astro dev` (or `preview`) server, covering all five resources
- `npm run lint` passes

#### Manual Verification:

- With `BASE_URL` unset or the server stopped, confirm `npm run test:integration`
  fails with the clear precondition error from `http-client.ts`, not a raw ECONNREFUSED
  stack trace
- Temporarily comment out one RLS policy predicate (e.g. the `employees` UPDATE
  policy's department check) in a local-only migration copy, confirm the
  corresponding new test fails, then revert — confirms the integration suite actually
  detects an IDOR regression

---

## Phase 4: Docs & cookbook

### Overview

Fill in `context/foundation/test-plan.md` §6 cookbook placeholders with the real file
paths and commands this phase shipped, and note the new test commands in `AGENTS.md`
so future contributors (human or agent) know how to run and extend the suite.

### Changes Required:

#### 1. Test-plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` placeholders in §6.1 (unit), §6.2 (integration), and
§6.4 (new API endpoint) with concrete guidance naming the actual files from Phases
1–3, so a future contributor knows exactly which file to pattern-match when adding a
new unit test for a service function or a new integration test for a department-
scoped endpoint. Also fill §6.6 with a one-line note for this rollout phase.

**Contract**: §6.1/§6.2/§6.4 each name: the pattern file (`signatures.unit.test.ts` for
unit; `cross-department-isolation.test.ts` + `support/http-client.ts` +
`support/test-users.ts` for integration), the command to run it, and the one-sentence
behavior it proves. No change to §1–§5 (frozen strategy sections) or to the Risk Map/
Risk Response Guidance.

#### 2. Contributor-facing test commands

**File**: `AGENTS.md`

**Intent**: Add the three new npm scripts (`test`, `test:unit`, `test:integration`) to
the existing "Build, Test, and Development Commands" section, alongside the
`test:integration` precondition (`supabase start` + a running dev/preview server +
`BASE_URL`).

**Contract**: One new bullet line per script under the existing "Build, Test, and
Development Commands" heading, matching the existing bullet format for `npm run dev`
/ `npm run smoke` etc. No restructuring of unrelated sections.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (Markdown/Prettier formatting of edited docs, via lint-staged
  conventions)

#### Manual Verification:

- A reviewer reads §6.1/§6.2/§6.4 and `AGENTS.md`'s test section and can correctly
  state, without opening the test files, which command to run for a new unit test vs.
  a new integration test, and what each verifies

---

## Testing Strategy

### Unit Tests:

- `generateSignatureArtifacts()` against the named injection fixture set, across all
  four employee text fields, plus a clean-fixture control and a `logo: null` case.

### Integration Tests:

- Two real, independently authenticated department sessions; cross-department 404
  assertions across employees CRUD, logo storage, signature generation, and
  signature-delivery creation.

### Manual Testing Steps:

1. Run `npm run test:unit` with no external dependencies and confirm all fixtures pass.
2. Start `supabase start` and `astro dev` (or build + `astro preview`), set
   `BASE_URL`, run `npm run test:integration`, confirm all cross-department
   assertions pass.
3. Deliberately break one RLS policy or one `escapeHtml()` call locally, confirm the
   corresponding test (and only that test) fails, then revert.

## Performance Considerations

Integration tests perform real network calls (Supabase Auth, Postgres, Storage) and
should be expected to run slower than unit tests; the Vitest integration project's
default timeout should be raised accordingly (see Phase 1, Changes Required #2).

## Migration Notes

Not applicable — this phase adds test infrastructure only; no schema or runtime code
changes.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Rollout source: `context/foundation/test-plan.md` §2 (Risk Map, Risk Response
  Guidance), §3 Phase 1
- Existing HTTP/cookie-jar pattern to port: `scripts/smoke.mjs:16-66`
- Unit-test boundary: `src/lib/services/signatures.ts:186-200`
- RLS enforcement reference: `supabase/migrations/20260922193159_department_scoped_data_foundation.sql:49-73`,
  `supabase/migrations/20260928000000_employees_update_delete_policies.sql:5-38`,
  `supabase/migrations/20260928000001_department_logo_storage.sql:28-91`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 npm install completes with Vitest added to devDependencies — 89eb6db
- [x] 1.2 npm run test:unit passes (placeholder test green, including the @/* alias import) — 89eb6db
- [x] 1.3 npm run lint passes (no new lint errors from the added config/script files) — 89eb6db

#### Manual

- [x] 1.4 Running npm run test:integration without BASE_URL set fails fast with a clear, readable error — 89eb6db

### Phase 2: Risk #3 unit tests — script-injection escaping

#### Automated

- [x] 2.1 npm run test:unit passes, including all fixture/field combinations from the named set across all four employee fields
- [x] 2.2 npm run lint passes

#### Manual

- [x] 2.3 Temporarily remove one escapeHtml() call and confirm the new unit test fails with a clear assertion message, then revert

### Phase 3: Risk #1 integration tests — cross-department IDOR

#### Automated

- [ ] 3.1 npm run test:integration passes against a locally running supabase start + astro dev (or preview) server, covering all five resources
- [ ] 3.2 npm run lint passes

#### Manual

- [ ] 3.3 With BASE_URL unset or the server stopped, confirm npm run test:integration fails with the clear precondition error, not a raw ECONNREFUSED stack trace
- [ ] 3.4 Temporarily comment out one RLS policy predicate locally, confirm the corresponding new test fails, then revert

### Phase 4: Docs & cookbook

#### Automated

- [ ] 4.1 npm run lint passes (Markdown/Prettier formatting of edited docs)

#### Manual

- [ ] 4.2 A reviewer can correctly state, from §6.1/§6.2/§6.4 and AGENTS.md alone, which command to run for a new unit test vs. a new integration test, and what each verifies
