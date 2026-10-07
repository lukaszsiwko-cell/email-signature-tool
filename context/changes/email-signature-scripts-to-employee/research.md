---
date: 2026-10-02T10:10:36+02:00
researcher: GitHub Copilot
git_commit: a0a20f9
branch: main
repository: email-signature-tool
topic: "Research S-05 email delivery for generated employee signatures"
tags: [research, email, signatures, cloudflare-workers, supabase]
status: partial
last_updated: 2026-10-07
last_updated_by: GitHub Copilot
---

# Research: S-05 email delivery for generated employee signatures

**Date**: 2026-10-02T10:10:36+02:00  
**Researcher**: GitHub Copilot  
**Git Commit**: a0a20f9  
**Branch**: main  
**Repository**: email-signature-tool

## Research Question

What changes are required to email a one-time link to generated employee signature files through Gmail SMTP from Cloudflare Workers, while preserving department isolation and the employee-data privacy guardrail?

## Summary

The PRD requires the help desk user to request generation and email both scripts with instructions and a download link. In the inspected employee model and create form, no employee email field exists (`src/types.ts`, `src/lib/services/employees.ts`, `src/components/employees/AddEmployeeForm.tsx`). The signature endpoint currently returns generated artifacts to an authenticated caller (`src/pages/api/employees/[id]/signatures.ts`).

At the time of the original research (2026-10-02), no email provider or mail-specific configuration was present, and a company-managed HTTPS relay was selected. On 2026-10-07, the user changed the provider decision to Gmail SMTP. The current implementation uses Nodemailer with implicit TLS on `smtp.gmail.com:465`, configured with server-only Astro environment variables. Employee email and delivery remain optional; manual downloads do not depend on email configuration.

Cloudflare Workers supports outbound TCP/TLS through Node compatibility, while blocking outbound SMTP on port 25; this integration uses port 465. Automated tests mock the Nodemailer transport. Actual SMTP authentication and message delivery from the Cloudflare Worker runtime remain to be verified with rotated Gmail credentials and a test mailbox.

## Detailed Findings

### Employee recipient

- Employee records now include an optional email, kept nullable for existing rows and new employees without a known address (`src/types.ts`, `src/lib/services/employees.ts`).
- The add form submits the email only when supplied and validates non-empty addresses (`src/components/employees/AddEmployeeForm.tsx`, `src/pages/api/employees/index.ts`).

## Decision Update

- On 2026-10-02, the user corrected the earlier required-recipient decision: employee email is optional, and relay configuration is optional. Manual artifact downloads remain available when either is missing; the send action is disabled until both are present.
- On 2026-10-07, the user replaced the company-relay assumption with Gmail SMTP over implicit TLS on port 465, using the existing Gmail account configuration. This is a provider decision, not a Cloudflare HTTPS limitation: Workers can make outbound HTTPS requests, but no company relay endpoint is available for this project.
- The existing employees table has department-scoped RLS; any new delivery record must preserve the same department boundary (`supabase/migrations/20260922193159_department_scoped_data_foundation.sql`).

### Signature generation and runtime

- The authenticated signature route loads the caller-visible employee and department logo, then returns Outlook HTML and a Thunderbird installer (`src/pages/api/employees/[id]/signatures.ts`, `src/lib/services/signatures.ts`).
- The existing API response uses `Cache-Control: no-store`; this is appropriate for generated employee data (`src/pages/api/employees/[id]/signatures.ts`).
- The app uses the Cloudflare adapter with `nodejs_compat`; outbound TCP/TLS is supported through the Node compatibility APIs. Cloudflare blocks SMTP port 25, not the configured implicit-TLS port 465. Live compatibility and authentication still require a Worker-runtime test (`astro.config.mjs`, `wrangler.jsonc`).
- The app-side adapter uses Gmail SMTP at `smtp.gmail.com:465`. `GMAIL_SMTP_USERNAME`, `GMAIL_SMTP_APP_PASSWORD`, and `EMAIL_FROM` are server-only settings. Gmail receives the one-time link in the message body; generated files are not sent as attachments.

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

- Keep Gmail credentials server-only. The approved decision now permits Gmail to receive the recipient, sender, subject, and one-time link; never attach generated artifacts or log credentials, message bodies, or recipient addresses.
- A single-use link must redeem all files as one delivery action, or the employee could consume the token on the first file and lose access to the second. The landing-page and response shape should make the set of generated artifacts available after one explicit redemption.
- A GET-only email-link landing page should not redeem the token; scanners commonly fetch links automatically. Redeem only after the recipient explicitly requests the files.

## Historical Context (from prior changes)

- `context/changes/generate-signature-scripts/plan.md` — S-04 generates the Outlook HTML and Thunderbird PowerShell installer; S-05 is intentionally separate.
- `context/foundation/roadmap.md` — S-05 is proposed and depends on S-04.

## Related Research

Not applicable; no S-05 research artifact existed before this change.

## Open Questions

- Does the Nodemailer implicit-TLS transport authenticate and deliver successfully from the deployed Cloudflare Worker runtime?
- Is the configured sender address accepted by the Gmail account or one of its sender aliases?
- What employee-facing instruction text and fallback should be used when delivery fails? No delivery tracking is required by the PRD, but the operator needs an immediate error or success result.
