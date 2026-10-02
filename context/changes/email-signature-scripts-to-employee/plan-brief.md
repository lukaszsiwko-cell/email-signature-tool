# Email Signature Scripts to the New Employee — Plan Brief

> Full plan: `context/changes/email-signature-scripts-to-employee/plan.md`
> Research: `context/changes/email-signature-scripts-to-employee/research.md`

## What & Why

Add optional email delivery to the signature tool. When an employee address and company relay are configured, a help-desk user can send the generated Outlook and Thunderbird files through a one-time link that expires after 24 hours; manual downloads remain available without email configuration.

## Starting Point

Employees now have an optional email field, and generation returns files to the signed-in operator. The app runs on Cloudflare Workers with Supabase RLS; a mail relay is not required for manual downloads.

## Desired End State

The operator can always download the generated files. When an employee has an address and the company HTTPS relay is configured, the operator can send a one-time link without uploading file contents to the relay. The employee opens the public download page, explicitly redeems the link once, and downloads the complete artifact set without an app account.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Mail provider | Company-managed HTTPS relay at `POST /send` | Preserves the privacy boundary; no third-party provider was approved | Plan |
| Relay payload | `{ to, subject, text }` with server-side bearer token | Keeps generated scripts out of the relay request body | Plan |
| Employee recipient | Optional work email on new and existing records | Addresses may not be known when employees are added; preserve existing data and manual workflows | User correction |
| Link policy | 24-hour, single-use random token | Limits exposure while allowing a recipient to retrieve the files without an app account | Plan |
| Redemption | Explicit POST from a landing page; atomic DB consume returns all files | A page fetch must not consume the link, and files must be released as one set | Research / Plan |
| Operator workflow | Separate explicit send action; keep current local-download action | Avoids surprise email when adding an employee and preserves manual downloads | Plan |

## Scope

**In scope:** optional employee email storage and validation, one-time delivery records, recipient download page, optional company relay adapter, explicit operator send action, cleanup, tests, and setup documentation.

**Out of scope:** external mail providers, SMTP, attachments, open/run tracking, and changes to generated signature formats.

## Architecture / Approach

The authenticated app creates a short-lived delivery record scoped to the employee's department. The database stores the artifact bundle and only a hash of a 256-bit token; an atomic security-definer RPC deletes and returns the bundle on first valid redemption. The email includes a URL-fragment token, which the recipient submits only after an explicit action. A server-only relay adapter posts the address, subject, and text link to the company's HTTPS endpoint.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Employee email | Schema, forms, API validation, and legacy compatibility | Existing rows have no address to backfill |
| 2. One-time download | RLS-scoped artifact storage, atomic redemption, expiry cleanup, and recipient page | Token replay, scanner requests, and large embedded logos |
| 3. Company relay | Server-only sender adapter, authenticated send route, and operator action | Real relay endpoint and network route are deployment prerequisites |
| 4. Verify and handoff | Mock-relay smoke coverage and operator setup instructions | Live delivery needs approved relay configuration |

**Prerequisites:** S-04 must be completed. Email sending additionally requires a reachable HTTPS relay, its bearer secret, and the app's public URL; manual downloads do not.  
**Estimated effort:** ~3-4 implementation sessions across 4 phases, plus one configured relay verification.

## Open Risks & Assumptions

- The approved HTTPS relay endpoint is not yet configured or verified as reachable from Cloudflare Workers.
- The relay owns the sender identity and must accept the documented `/send` contract.
- Generated files can contain an embedded logo of up to the existing upload limit; delivery storage and responses must handle the resulting multi-megabyte payload without logging it.

## Success Criteria (Summary)

- Operators can send only to the email stored on an employee record visible to their department.
- The recipient can retrieve all generated files exactly once within 24 hours, with no app account.
- No third-party mail provider receives artifacts, and expired or failed-send links do not expose them.
