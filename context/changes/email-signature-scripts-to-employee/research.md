---
date: 2026-10-02T10:10:36+02:00
researcher: GitHub Copilot
git_commit: a0a20f9
branch: main
repository: email-signature-tool
topic: "Research S-05 email delivery for generated employee signatures"
tags: [research, email, signatures, cloudflare-workers, supabase]
status: partial
last_updated: 2026-10-02
last_updated_by: GitHub Copilot
---

# Research: S-05 email delivery for generated employee signatures

**Date**: 2026-10-02T10:10:36+02:00  
**Researcher**: GitHub Copilot  
**Git Commit**: a0a20f9  
**Branch**: main  
**Repository**: email-signature-tool

## Research Question

What changes are required to email both generated signature scripts to an employee through an approved company mail relay, with a 24-hour, single-use download link, while preserving department isolation and the employee-data privacy guardrail?

## Summary

The PRD requires the help desk user to request generation and email both scripts with instructions and a download link. In the inspected employee model and create form, no employee email field exists (`src/types.ts`, `src/lib/services/employees.ts`, `src/components/employees/AddEmployeeForm.tsx`). The signature endpoint currently returns generated artifacts to an authenticated caller (`src/pages/api/employees/[id]/signatures.ts`).

No email provider or email-specific server configuration was found in the inspected package, Astro environment schema, Worker configuration, or source tree. The app runs as an Astro server on Cloudflare Workers (`astro.config.mjs`, `wrangler.jsonc`). The user selected a company-managed HTTPS relay and a 24-hour single-use link, then corrected the recipient decision: employee email and email delivery are optional. When configured, the relay contract is `POST /send` with `{ to, subject, text }` and a server-side bearer token.

The research remains partial because no relay endpoint or network route is configured in the repository; delivery cannot be tested against the company's mail system yet. The implementation can use a mock relay in automated tests and document server-side configuration, but deployment verification will need a reachable approved endpoint.

## Detailed Findings

### Employee recipient

- Employee records now include an optional email, kept nullable for existing rows and new employees without a known address (`src/types.ts`, `src/lib/services/employees.ts`).
- The add form submits the email only when supplied and validates non-empty addresses (`src/components/employees/AddEmployeeForm.tsx`, `src/pages/api/employees/index.ts`).

## Decision Update

- On 2026-10-02, the user corrected the earlier required-recipient decision: employee email is optional, and relay configuration is optional. Manual artifact downloads remain available when either is missing; the send action is disabled until both are present.
- The existing employees table has department-scoped RLS; any new delivery record must preserve the same department boundary (`supabase/migrations/20260922193159_department_scoped_data_foundation.sql`).

### Signature generation and runtime

- The authenticated signature route loads the caller-visible employee and department logo, then returns Outlook HTML and a Thunderbird installer (`src/pages/api/employees/[id]/signatures.ts`, `src/lib/services/signatures.ts`).
- The existing API response uses `Cache-Control: no-store`; this is appropriate for generated employee data (`src/pages/api/employees/[id]/signatures.ts`).
- The app uses the Cloudflare adapter and declares only Supabase server environment fields in Astro config; the Worker has no mail binding or mail-specific configuration in the inspected files (`astro.config.mjs`, `wrangler.jsonc`).
- A company HTTPS relay is the selected boundary. The app-side adapter contract is `POST /send` with `{ to, subject, text }`, authenticated by a bearer token kept in server configuration. Actual endpoint reachability, sender identity, and credential provisioning remain deployment prerequisites.

### One-time delivery link

- The selected link policy is 24-hour expiry and one successful redemption.
- Generated artifacts currently exist only in the authenticated generation response, so an unauthenticated recipient link requires new short-lived delivery state.
- The implementation plan must define atomic redemption, storage of generated artifacts, token hashing, and an interstitial recipient action so mail-security link scanners do not consume the token merely by fetching the URL.

### Historical context

- S-05 is the next roadmap slice and depends on S-04 (`context/foundation/roadmap.md`).
- The S-04 plan lists manual New Outlook verification and cross-client logo/no-logo rendering as pending; the user confirmed the Thunderbird installer works after the execution-policy launcher change (`context/changes/generate-signature-scripts/plan.md`).

## Code References

- `context/foundation/prd.md` — FR-006, US-01, privacy guardrail, and S-05 success criteria.
- `src/types.ts` — employee and signature artifact DTOs.
- `src/lib/services/employees.ts` — employee persistence and department-scoped service access.
- `src/components/employees/AddEmployeeForm.tsx` — employee creation form.
- `src/pages/api/employees/[id]/signatures.ts` — authenticated signature generation endpoint.
- `src/lib/services/signatures.ts` — generated Outlook and Thunderbird artifacts.
- `astro.config.mjs`, `wrangler.jsonc` — Cloudflare Worker runtime and server configuration.
- `supabase/migrations/20260922193159_department_scoped_data_foundation.sql` — employee schema and department RLS pattern.

## Architecture Insights

- Keep mail credentials server-only and send through the company relay; do not introduce a third-party mail provider without changing the privacy decision.
- A single-use link must redeem all files as one delivery action, or the employee could consume the token on the first file and lose access to the second. The landing-page and response shape should make the set of generated artifacts available after one explicit redemption.
- A GET-only email-link landing page should not redeem the token; scanners commonly fetch links automatically. Redeem only after the recipient explicitly requests the files.

## Historical Context (from prior changes)

- `context/changes/generate-signature-scripts/plan.md` — S-04 generates the Outlook HTML and Thunderbird PowerShell installer; S-05 is intentionally separate.
- `context/foundation/roadmap.md` — S-05 is proposed and depends on S-04.

## Related Research

Not applicable; no S-05 research artifact existed before this change.

## Open Questions

- What approved HTTPS relay endpoint will be configured, and is it reachable from the deployed Cloudflare Worker?
- Which sender address/name is allowed by the relay?
- What employee-facing instruction text and fallback should be used when delivery fails? No delivery tracking is required by the PRD, but the operator needs an immediate error or success result.
