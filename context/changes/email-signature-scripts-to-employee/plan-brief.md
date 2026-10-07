# Email Signature Scripts to the New Employee — Plan Brief

> Full plan: `context/changes/email-signature-scripts-to-employee/plan.md`
> Research: `context/changes/email-signature-scripts-to-employee/research.md`

## What & Why

Add optional email delivery to the signature tool. When an employee address and Gmail SMTP are configured, a help-desk user can email a one-time link to the generated Outlook and Thunderbird files; manual downloads remain available without email configuration.

## Starting Point

Employees now have an optional email field, and generation returns files to the signed-in operator. The app runs on Cloudflare Workers with Supabase RLS; email configuration is not required for manual downloads.

## Desired End State

The operator can always download the generated files. When an employee has an address and Gmail SMTP is configured, the operator can email a one-time link without attaching or transmitting generated file contents. The employee opens the public download page, explicitly redeems the link once, and downloads the complete artifact set without an app account.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Mail provider | Gmail SMTP at `smtp.gmail.com:465` with implicit TLS | No company relay endpoint is available; user selected the existing Gmail account | User decision, 2026-10-07 |
| SMTP credentials | Server-only `GMAIL_SMTP_USERNAME` and `GMAIL_SMTP_APP_PASSWORD` | Keeps the Gmail app password out of browser code | User decision |
| Email payload | Recipient, sender, subject, and one-time download link; no attachments | Keeps generated scripts out of the email payload | Privacy guardrail |
| Employee recipient | Optional work email on new and existing records | Addresses may not be known when employees are added; preserve existing data and manual workflows | User correction |
| Link policy | 24-hour, single-use random token | Limits exposure while allowing a recipient to retrieve the files without an app account | Plan |
| Redemption | Explicit POST from a landing page; atomic DB consume returns all files | A page fetch must not consume the link, and files must be released as one set | Research / Plan |
| Operator workflow | Separate explicit send action; keep current local-download action | Avoids surprise email when adding an employee and preserves manual downloads | Plan |

## Scope

**In scope:** optional employee email storage and validation, one-time delivery records, recipient download page, optional Gmail SMTP adapter, explicit operator send action, cleanup, tests, and setup documentation.

**Out of scope:** a company-managed HTTPS relay, email attachments, open/run tracking, and changes to generated signature formats.

## Architecture / Approach

The authenticated app creates a short-lived delivery record scoped to the employee's department. The database stores the artifact bundle and only a hash of a 256-bit token; an atomic security-definer RPC deletes and returns the bundle on first valid redemption. The email includes a URL-fragment token, which the recipient submits only after an explicit action. A server-only Gmail SMTP adapter sends the recipient, sender, subject, and one-time link without attachments.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Employee email | Schema, forms, API validation, and legacy compatibility | Existing rows have no address to backfill |
| 2. One-time download | RLS-scoped artifact storage, atomic redemption, expiry cleanup, and recipient page | Token replay, scanner requests, and large embedded logos |
| 3. Gmail SMTP | Server-only Nodemailer adapter, authenticated send route, and operator action | SMTP/TLS and app-password authentication must work from Cloudflare Workers |
| 4. Verify and handoff | Mock-SMTP smoke coverage and operator setup instructions | Live delivery needs Gmail credentials and Worker-runtime verification |

**Prerequisites:** S-04 must be completed. Email sending additionally requires a Gmail app password, sender address, and the app's public URL; manual downloads do not. Store SMTP credentials as server-only secrets.  
**Estimated effort:** ~3-4 implementation sessions across 4 phases, plus one live SMTP verification from the Worker runtime.

## Open Risks & Assumptions

- Gmail SMTP authentication and TLS connectivity from the deployed Cloudflare Worker still require live verification.
- Gmail receives the one-time link in the email body; generated files must never be attached or included in SMTP content.
- Generated files can contain an embedded logo of up to the existing upload limit; delivery storage and responses must handle the resulting multi-megabyte payload without logging it.

## Success Criteria (Summary)

- Operators can send only to the email stored on an employee record visible to their department.
- The recipient can retrieve all generated files exactly once within 24 hours, with no app account.
- Gmail receives only the one-time link, not generated artifact files; expired or failed-send links do not expose them.
