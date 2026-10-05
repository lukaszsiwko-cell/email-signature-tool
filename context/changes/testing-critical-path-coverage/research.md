---
date: 2026-10-05T07:55:00+02:00
researcher: Copilot CLI
git_commit: a618f175415300daddc560ad546c45d61d2730f5
branch: main
repository: lukaszsiwko-cell/email-signature-tool
topic: "Phase 1 critical-path test coverage: cross-department IDOR (Risk #1) and HTML/PowerShell script-injection escaping (Risk #3)"
tags: [research, codebase, rls, supabase, idor, escaping, signatures, vitest, test-plan-phase-1]
status: complete
last_updated: 2026-10-05
last_updated_by: Copilot CLI
---

# Research: Critical-path coverage (test-plan.md §3 Phase 1)

**Date**: 2026-10-05T07:55:00+02:00
**Researcher**: Copilot CLI
**Git Commit**: a618f175415300daddc560ad546c45d61d2730f5
**Branch**: main
**Repository**: lukaszsiwko-cell/email-signature-tool

## Research Question

For `context/changes/testing-critical-path-coverage/` (test-plan.md §3 Phase 1), how
should Risk #1 (cross-department IDOR on employees/departments/logos/signatures) and
Risk #3 (HTML/PowerShell script-injection via unescaped employee fields) actually be
tested, given the current code? Specifically:

1. Is department isolation enforced by real Supabase RLS, application code, both, or
   neither, for each of employees / departments / department logos / generated
   signatures — and where is the enforcement boundary a test must exercise?
2. Where exactly do employee fields get interpolated into the HTML artifact and the
   PowerShell artifact, and is each interpolation point escaped/encoded for its
   target language?
3. What constraints does the current stack (Astro SSR + Cloudflare adapter +
   Supabase, no test runner configured yet) place on bootstrapping Vitest for unit
   and integration tests in this phase?

## Summary

**Risk #1 (IDOR).** Department isolation for employees, department logo storage, and
signature-delivery rows is enforced by real Postgres Row Level Security policies that
all key off `public.profiles.department_id` joined to `auth.uid()`
(`supabase/migrations/20260922193159_department_scoped_data_foundation.sql:49-73`,
`supabase/migrations/20260928000000_employees_update_delete_policies.sql:5-38`,
`supabase/migrations/20260928000001_department_logo_storage.sql:28-91`,
`supabase/migrations/20261002000100_signature_deliveries.sql:21-37`). No API route or
service imports a service-role/admin Supabase client; every handler uses the
request-scoped, cookie-authenticated client from `createClient(...)`
(`src/pages/api/employees/index.ts:40`, `src/pages/api/employees/[id].ts:43,100`,
`src/pages/api/departments/logo.ts:33,69`, `src/lib/services/employees.ts`,
`src/lib/services/departments.ts`, `src/lib/services/signature-deliveries.ts`). A
cross-department employee/logo/delivery request therefore fails at the database/
storage layer (row invisible via RLS → handler returns 404), not via an
application-level department-id comparison — `src/middleware.ts:4` enforces only
*authentication* (`PROTECTED_ROUTES = ["/dashboard", "/employees"]`), with no
department check. This means a real-RLS integration test (not a mocked-auth unit
test) is the only way to exercise the actual boundary, matching test-plan.md's
"Must challenge" column for Risk #1 and the "Anti-pattern to avoid" warning.

Two intentional exceptions exist and are **not** Risk #1 gaps to fix, but boundaries
a test must respect rather than assume are bugs: (a) `departments` SELECT is public
(`using (true)`, `...department_scoped_data_foundation.sql:31-35`) by design, for the
signup department picker; (b) the signature-download redemption RPC
(`src/pages/api/signature-download/redeem.ts:16-41`) is intentionally bearer-token
authorized for anonymous recipients, not department-membership authorized — this is
Risk #2/#5 territory (Phase 2), not Risk #1.

**Risk #3 (injection).** The single generation entry point is the exported pure
function `generateSignatureArtifacts(employee, logo)`
(`src/lib/services/signatures.ts:186-200`), which has no database/network dependency
and is the correct unit-test boundary. Every employee text field reaching the HTML
artifact (`displayName` = `firstName`+`lastName`, `position`, `phone`) is passed
through a local `escapeHtml()` helper that escapes `& < > " '`
(`src/lib/services/signatures.ts:12-27`, call sites at `signatures.ts:45-49`). The
PowerShell artifact (`createThunderbirdInstaller`) never interpolates employee fields
as PowerShell source at all: it Base64-encodes the *already-escaped* HTML string and
embeds only that Base64 text inside a single-quoted PowerShell literal
(`signatures.ts:52-56`); the script decodes and writes it back out as a file
(`signatures.ts:153-158` per the explore worker's anchor — see Code References for
the exact lines re-verified in this pass). Base64's alphabet
(`A-Za-z0-9+/=`) contains none of `"`, `` ` ``, `$`, `(`, `)`, so no employee value can
break out of the single-quoted literal or trigger PowerShell command/variable
substitution through this path. This matches the prior plan's requirement verbatim:
"script payload data must be encoded rather than interpolated as executable
PowerShell source" (`context/changes/generate-signature-scripts/plan.md:40`). A unit
test for Risk #3 should assert both properties directly on
`generateSignatureArtifacts()`'s return value: the HTML contains the escaped entities
(not raw `<`/`"`) and the PowerShell installer string contains no raw occurrence of
the injected payload outside the Base64 blob.

**Test-runner bootstrap.** No test runner is configured today — `package.json` has no
Vitest/Jest dependency or test script (`package.json:5-13,39-57` — scripts are only
`dev`, `build`, `preview`, `astro`, `lint`, `lint:fix`, `format`, `smoke`). `.nvmrc`
pins Node `26.3.0`, but CI's `setup-node` steps currently request Node `22`
(`.github/workflows/ci.yml:16-17,33-34`) — this is a pre-existing mismatch unrelated
to this phase, worth flagging but not for this phase to fix silently. Application
code imports Astro virtual modules (`astro:env/server` in `src/lib/supabase.ts:3`,
`src/lib/config-status.ts:1`, `src/lib/services/email-service.ts:1`; `astro:middleware`
in `src/middleware.ts:1`) and a Cloudflare Worker virtual module
(`cloudflare:workers` in `src/lib/services/email-service.ts:2`). The unit-test target
for Risk #3, `src/lib/services/signatures.ts`, imports neither — it only imports
local types (`@/types`, `@/lib/services/departments`) — so it can run under plain
Node-mode Vitest without Astro's `getViteConfig` or any Cloudflare-specific pool. A
Vitest config that later needs to touch `src/lib/supabase.ts`, `src/middleware.ts`, or
`email-service.ts` would need Astro-aware Vite resolution (`getViteConfig` from
`astro/config`) and/or mocks for the Cloudflare/Astro virtual modules; this phase's
scope (Risk #1 integration test, Risk #3 unit test) does not require exercising
`src/middleware.ts` or `email-service.ts` directly. The existing `scripts/smoke.mjs`
already contains hand-rolled assertions for both risks — a cross-department 404 check
for signature generation (`scripts/smoke.mjs` around the "second department cannot
generate the first department employee's signatures" case, `{status: 404}`) and an
HTML-escaping fixture using `firstName: "Smoke <script>alert(1)</script>"` and
`position: "Tester & Support"` asserting `&lt;script&gt;` / `&amp; Support` appear and
raw `<script>` does not — these are useful reference fixtures/oracles to port into the
new unit/integration suite, not to replace (smoke stays as the deployed-HTTP-surface
check per test-plan.md §4). Local Supabase assumptions for the integration test:
`supabase/config.toml` configures API port `54321`, DB port `54322`, Auth enabled
with signup enabled, and seed/migrations enabled; `supabase/seed.sql:1-2` seeds four
departments (`IT`, `HR`, `Sales`, `Finance`) but no users/employees — integration
tests must create their own Auth users (with `department_id` in signup metadata) and
employees via real HTTP/Auth calls, exactly as CI's `smoke` job already does
(`.github/workflows/ci.yml:36-45`).

## Detailed Findings

### Risk #1 — Department isolation enforcement

| Resource | RLS enabled? | Policy predicate | API/service client | App-code department check |
|---|---|---|---|---|
| `public.profiles` | Yes (`...foundation.sql:23`) | `auth.uid() = id` for select/insert (`...foundation.sql:37-47`) | n/a (read by services internally) | n/a |
| `public.departments` | Yes (`...foundation.sql:22`) | SELECT: `using (true)` for `anon, authenticated` (`...foundation.sql:31-35`) — intentionally public; UPDATE: caller's `profiles.department_id = departments.id` (`20260928000001_department_logo_storage.sql:7-26`) | user-session client (`src/lib/services/departments.ts:1-4`) | `getOwnDepartmentId()` re-derives from `auth.getUser()` + profile (`departments.ts:20-42`); update/delete routes accept no department id param (`src/pages/api/departments/logo.ts:28-54,64-84`) |
| `public.employees` | Yes (`...foundation.sql:24`) | SELECT/INSERT/UPDATE: `profiles.id = auth.uid() AND profiles.department_id = employees.department_id` (`...foundation.sql:49-73`, `20260928000000_employees_update_delete_policies.sql:5-24`); DELETE: same predicate (`...employees_update_delete_policies.sql:26-38`) | user-session client (`src/lib/services/employees.ts`) | create derives `department_id` from caller's profile, never from client input (`employees.ts:77-89,91-102`); update schema never accepts `department_id` (`src/pages/api/employees/[id].ts:8-24`, `employees.ts:111-121`) |
| Department logo (Storage) | Yes, Storage policies (`20260928000001_department_logo_storage.sql:28-91`) | `(storage.foldername(name))[1]::uuid` must equal caller's `profiles.department_id` for select/insert/update/delete | user-session client; logo key built server-side as `` `${departmentId}/logo` `` from the caller's own department (`src/lib/services/departments.ts:150-157,178-190`) | caller never supplies the department id in the key — it's derived, so a crafted path to another department's logo still fails Storage RLS |
| Generated signature (in-memory artifact) | n/a — no table; generation is pure (`src/lib/services/signatures.ts`) | n/a | employee + logo are loaded through the RLS-scoped client before generation (`src/pages/api/employees/[id]/signatures.ts:32-38`) | none needed beyond the RLS-scoped reads it depends on |
| `public.signature_deliveries` | Yes, direct table access revoked (`20261002000100_signature_deliveries.sql:21-22`) | INSERT: caller's profile department must equal `signature_deliveries.department_id` AND the employee must belong to that department (`...signature_deliveries.sql:24-37`) | user-session client for creation (`src/lib/services/signature-deliveries.ts:1-6,22-36`); `SECURITY DEFINER` RPC for redemption, callable by `anon`+`authenticated` (`...signature_deliveries.sql:39-62`) | redemption is **intentionally** token-authorized, not department-authorized — out of scope for Risk #1, relevant to Risk #2/#5 (Phase 2) |

`src/middleware.ts:4` (`PROTECTED_ROUTES = ["/dashboard", "/employees"]`) and
`src/middleware.ts:10-22` confirm the middleware only gates unauthenticated access; it
does not resolve or compare a department id, so all department isolation is delegated
to the RLS policies above plus the server-derived department ids in the service
layer. This matches the Risk Response Guidance's framing exactly: "RLS exists so
every route is automatically safe" is the challengeable assumption, and the concrete
proof required is that a second department's call is rejected by **real** RLS.

### Risk #1 — What a real-RLS integration test needs

- Local stack: `supabase start` then (if schema changed) `supabase db reset`, using
  the ports in `supabase/config.toml` (API `54321` region, DB `54322`), matching how
  CI's `smoke` job already boots the stack (`.github/workflows/ci.yml:36-42`).
- Fixtures: `supabase/seed.sql:1-2` seeds four departments (`IT`, `HR`, `Sales`,
  `Finance`) but no users or employees — the test must create two real Auth users
  (each via Supabase Auth signup with a different seeded `department_id` in
  `user_metadata`, which the `on_auth_user_created` trigger turns into a `profiles`
  row per `...foundation.sql:75-88`) and one employee per department, all through
  real authenticated HTTP calls — not mocked `auth.uid()` or a mocked Supabase
  client.
- Assertions to make (per department pair A/B), using real session cookies/JWTs for
  each user: listing employees returns only the caller's department; GET/PUT/DELETE
  on the other department's employee id returns 404 (RLS makes the row invisible,
  the handler reports not-found rather than forbidden); generating a signature for
  the other department's employee id returns 404; logo access/upload/delete against
  the other department's storage path is rejected by Storage RLS; creating a
  signature delivery for the other department's employee fails/produces no row.
- `scripts/smoke.mjs` already implements exactly this pattern end-to-end (two
  department users via `jar: "userB"` vs default cookie jar, asserting `{status:
  404}` for cross-department signature generation) — this is a working reference
  oracle for the new integration suite's fixtures and assertions, not something to
  duplicate as deployed-HTTP-only coverage. The new suite should assert the same
  properties with the project's chosen test runner (Vitest) so they run as part of
  `npm test` locally/in CI rather than only via a full `astro preview` + HTTP smoke
  pass.

### Risk #3 — HTML and PowerShell escaping paths

- Entry point: `generateSignatureArtifacts(employee, logo)` —
  `src/lib/services/signatures.ts:186-200`. Pure function: no DB/network import,
  only `@/types` and `@/lib/services/departments` (for the `DepartmentLogoAsset`
  type only). This is the unit-test boundary.
- HTML path: `createHtml()` (`signatures.ts:40-50`) builds `displayName` from
  `employee.firstName` + `employee.lastName` and inserts `displayName`, `position`,
  and (conditionally) `phone` through `escapeHtml()` at call sites
  `signatures.ts:45` (phone), `signatures.ts:48` (displayName), `signatures.ts:49`
  (position). `escapeHtml()` (`signatures.ts:12-27`) replaces `& < > " '` with their
  named/numeric entities. No employee field is inserted into the HTML without
  passing through this function.
- PowerShell path: `createThunderbirdInstaller(signatureHtml)`
  (`signatures.ts:52-?`) takes the *already-escaped* HTML string, Base64-encodes it
  with `encodeBase64()` (`signatures.ts:29-38`, uses `btoa` over UTF-8 bytes), and
  embeds only the resulting Base64 text inside a single-quoted PowerShell string
  literal: `` [System.Convert]::FromBase64String('${signatureHtmlBase64}') `` — the
  template itself is built with `String.raw` so `$signatureHtmlBase64` is the only
  interpolation point, and its value is constrained to the Base64 alphabet
  (`A-Za-z0-9+/=`), which contains none of PowerShell's special characters (`"`,
  `` ` ``, `$`, `(`, `)`, single quote). No employee field is interpolated into
  PowerShell source directly anywhere else in the installer or the launcher
  (`createThunderbirdLauncher()` is fully static and employee-independent).
- Prior decision this implements: `context/changes/generate-signature-scripts/plan.md:40`
  — "Dynamic employee fields must be HTML-escaped; script payload data must be
  encoded rather than interpolated as executable PowerShell source." Current code
  matches this design; `context/changes/generate-signature-scripts/change.md`
  records the slice as already shipped.
- Existing adversarial fixture to reuse/extend: `scripts/smoke.mjs` already exercises
  `firstName: "Smoke <script>alert(1)</script>"` and `position: "Tester & Support"`,
  asserting the HTML contains `&lt;script&gt;` and `&amp; Support`, and that the
  PowerShell installer string does **not** contain a raw `<script>` substring. The
  test-plan's Risk #3 response intent additionally calls for `"`, `` ` ``, and
  `$()` fixtures, which are not in the current smoke fixture — the new unit test
  should add these to close that gap (smoke only proves `<script>`/`&`, not quote/
  backtick/subshell characters).

### Test-runner bootstrap constraints

- No Vitest/Jest dependency or config exists yet (`package.json:5-13,39-57`); no
  `vitest.config.*`/`jest.config.*` file found in the repo.
- `.nvmrc:1` pins Node `26.3.0`; CI's two jobs both request Node `22` via
  `actions/setup-node@v4` (`.github/workflows/ci.yml:16-17,33-34`) — a pre-existing
  version mismatch, unrelated to this phase, worth noting if the bootstrap needs to
  pick a Vitest version with Node-version constraints, but not something this
  phase's scope requires reconciling.
- Astro virtual-module imports in the codebase: `astro:env/server`
  (`src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`,
  `src/lib/services/email-service.ts:1`) and `astro:middleware`
  (`src/middleware.ts:1`); Cloudflare virtual module `cloudflare:workers`
  (`src/lib/services/email-service.ts:2`, declared in `src/env.d.ts:7`). None of
  these are imported by `src/lib/services/signatures.ts`, so the Risk #3 unit test
  can run under plain Node-mode Vitest without `astro/config`'s `getViteConfig` or a
  Cloudflare-specific Vitest pool (e.g. `@cloudflare/vitest-pool-workers`, which is
  not installed). A future phase that unit-tests `src/lib/supabase.ts`,
  `src/middleware.ts`, or `email-service.ts` directly would need that Astro-aware
  config and/or mocks for these virtual modules — out of scope for this phase.
- Local Supabase stack for the Risk #1 integration test: `supabase/config.toml`
  configures API port `54321`, DB port `54322`, Auth enabled with signup enabled,
  migrations+seed enabled. CI's `smoke` job already demonstrates the exact
  bring-up sequence this phase's integration tests should reuse: `supabase start
  -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,storage-api,
  postgres-meta,supavisor` then `supabase status -o env` to obtain `API_URL` and
  `ANON_KEY` (`.github/workflows/ci.yml:36-42`).
- `.github/workflows/ci.yml` currently has two jobs (`ci`: lint/typecheck/build;
  `smoke`: build+preview+HTTP smoke) and no unit/integration test command — wiring
  a new test command into CI is explicitly test-plan.md §3 Phase 3's job ("Wire the
  new suite into CI"), not this phase's.

## Code References

- `supabase/migrations/20260922193159_department_scoped_data_foundation.sql:3-73` — departments/profiles/employees tables + RLS policies (department scoping foundation)
- `supabase/migrations/20260928000000_employees_update_delete_policies.sql:5-38` — employees UPDATE/DELETE RLS policies
- `supabase/migrations/20260928000001_department_logo_storage.sql:7-91` — department UPDATE policy + Storage bucket RLS policies for logos
- `supabase/migrations/20261002000100_signature_deliveries.sql:3-62` — `signature_deliveries` table, RLS, insert policy, `SECURITY DEFINER` redemption RPC
- `supabase/migrations/20261002120000_backfill_missing_profiles.sql:1-7` — profile backfill for existing Auth users
- `supabase/config.toml:6-27,34-39,80-96,139-152` — local Supabase ports, migrations/seed, auth config
- `supabase/seed.sql:1-2` — seeded departments (IT, HR, Sales, Finance); no seeded users/employees
- `src/middleware.ts:1-23` — authentication-only middleware; `PROTECTED_ROUTES` has no department logic
- `src/pages/api/employees/index.ts:40,52,70,95` — employee list/create routes, user-session client
- `src/pages/api/employees/[id].ts:43,81,100,124` — employee get/update/delete routes
- `src/pages/api/employees/[id]/signatures.ts:32-41` — signature generation route (loads employee+logo via RLS, then calls `generateSignatureArtifacts`)
- `src/pages/api/employees/[id]/signature-deliveries.ts:20,29-39` — delivery creation route
- `src/pages/api/departments/logo.ts:28-84` — logo PUT/DELETE routes, no client-supplied department id
- `src/pages/api/signature-download/redeem.ts:16-41` — anonymous token-based redemption (intentionally not department-scoped)
- `src/lib/services/employees.ts:33-156` — employee CRUD service; create derives `department_id` server-side
- `src/lib/services/departments.ts:20-190` — `getOwnDepartmentId()`, logo key derivation, logo read/write/remove
- `src/lib/services/signature-deliveries.ts:1-63` — delivery insert/lookup, department re-derived from RLS-visible employee
- `src/lib/services/signatures.ts:1-200` — `generateSignatureArtifacts` (unit-test boundary), `escapeHtml`, `encodeBase64`, `createHtml`, `createThunderbirdInstaller`, `createThunderbirdLauncher`
- `scripts/smoke.mjs` (escaping fixture and cross-department 404 assertions) — reference oracle for new test fixtures
- `.github/workflows/ci.yml:8-55` — current CI jobs (`ci`, `smoke`); no unit/integration test step yet
- `package.json:5-13,39-57` — no test runner/script configured
- `.nvmrc:1` — Node `26.3.0` pinned, vs. CI's Node `22`
- `src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`, `src/lib/services/email-service.ts:1-2`, `src/middleware.ts:1`, `src/env.d.ts:7` — Astro/Cloudflare virtual-module imports relevant only to a *future* phase testing those modules directly

## Architecture Insights

- Department scoping is a **pure RLS-plus-server-derivation pattern**: no handler or
  service ever trusts a client-supplied department id for a write; department id is
  always re-derived from `auth.uid()` → `profiles.department_id` server-side, and
  reads rely on RLS making out-of-scope rows invisible (manifesting as 404, not 403).
  This is consistent across employees, logos, and signature deliveries — there is no
  resource where the service layer alone is the only defense.
- Escaping and encoding are deliberately split by target language at a single choke
  point (`signatures.ts`): HTML gets character-escaping: PowerShell gets payload
  encoding (Base64) instead of escaping, which structurally prevents injection rather
  than relying on correctly escaping every possible PowerShell metacharacter.
- The project already has a working integration-style oracle for both risks in
  `scripts/smoke.mjs`, run against a real local Supabase instance and a real `astro
  preview` server — the new Vitest suite should treat this as a pattern to mirror
  (real auth, real RLS, adversarial fixtures) rather than a reason the new suite is
  redundant (smoke only runs in CI's `smoke` job against a built preview, not as a
  fast local/CI unit+integration gate per test-plan.md §5).

## Historical Context (from prior changes)

- `context/changes/generate-signature-scripts/plan.md:40` — states the escaping/
  encoding contract this phase's Risk #3 test must verify ("Dynamic employee fields
  must be HTML-escaped; script payload data must be encoded rather than interpolated
  as executable PowerShell source"); `context/changes/generate-signature-scripts/change.md`
  marks the slice as shipped, and the current code matches the contract.
- `context/changes/add-and-list-employees/plan-brief.md:35-50` — establishes RLS as
  the department-isolation boundary, not application code alone.
- `context/changes/edit-and-delete-employee/plan.md:40-56` — documents the expected
  behavior that cross-department ids become invisible/404 through RLS (matches what
  was found in the live migrations/routes).
- `context/archive/2026-09-27-set-department-logo/plan-brief.md` — explicitly warns
  against service-role Storage access bypassing the department privacy boundary;
  current code has no service-role client anywhere, consistent with this guardrail.
- `context/foundation/test-plan.md` §2 (Risk Response Guidance for #1 and #3) and §3
  (Phase 1 scope) are the direct source of this phase's two risks and their "must
  challenge" / anti-pattern framing, both of which this research confirms are
  concretely testable against the current implementation.

## Related Research

- None found under `context/changes/**/research.md` or `context/archive/**/research.md`
  specific to test-runner bootstrapping or this risk pair; this is the first research
  document for the testing-critical-path-coverage change.

## Open Questions

- Exact Vitest version/config shape (Node-mode only vs. any need for `getViteConfig`)
  is a planning decision, not a research gap — this document establishes that plain
  Node-mode Vitest suffices for the Risk #3 unit test and that the Risk #1
  integration test needs a running local Supabase instance with real HTTP/Auth
  calls, which `/10x-plan` can size.
- The Node version mismatch between `.nvmrc` (`26.3.0`) and CI (`22`) is a
  pre-existing, out-of-scope inconsistency; flagged here in case the test-runner
  choice is sensitive to it, but not something this research recommends fixing as
  part of Phase 1.
