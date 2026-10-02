# Email Signature Scripts to the New Employee Implementation Plan

## Overview

Allow employee email addresses to be stored when known and deliver generated Outlook and Thunderbird artifacts through a company HTTPS relay when both a recipient address and relay configuration are available. Manual signature downloads remain available without either; delivered email links use one explicit, 24-hour, single-use redemption.

## Current State Analysis

The employee model and form now allow an optional email address. Signature generation returns its artifacts to an authenticated employee-management user, and one-time downloads are available independently of email. The app runs on Cloudflare Workers, has no email relay configured, and uses Supabase RLS to scope employee access by department. When configured, the relay contract is `POST /send` with `{ to, subject, text }` and a server-side bearer token.

### Key Discoveries:

- Employee persistence, DTOs, create validation, and UI support an optional email (`src/types.ts`, `src/lib/services/employees.ts`, `src/pages/api/employees/index.ts`, `src/components/employees/AddEmployeeForm.tsx`).
- The generated HTML, PowerShell installer, and `.cmd` launcher are returned by an authenticated endpoint (`src/lib/services/signatures.ts`, `src/pages/api/employees/[id]/signatures.ts`).
- Supabase secrets are accessed server-side and department RLS is the existing ownership boundary (`src/lib/supabase.ts`, `supabase/migrations/20260922193159_department_scoped_data_foundation.sql`).
- The HTTPS relay endpoint and network route are not configured yet; automated tests must use a mock relay, and live delivery requires approved deployment configuration (`context/changes/email-signature-scripts-to-employee/research.md`).

## Desired End State

A help-desk user can add employees with or without a work email and always download the generated files. When an employee address and company relay are configured, the operator can explicitly email a one-time link without attaching generated files to the relay request. The recipient opens a no-account download page, explicitly redeems the link once within 24 hours, and can download all files from that page. Expired, redeemed, failed-send, and cross-department deliveries cannot expose the files.

## What We're NOT Doing

- No third-party mail provider, SMTP integration, email-open tracking, or status tracking that the employee ran an installer.
- No email attachments; delivery uses a short-lived bearer link.
- No change to the New Outlook or Thunderbird artifact formats.
- No automatic sending when an employee is created; the operator uses an explicit send action.
- No account requirement for the recipient download page.

## Implementation Approach

Add a nullable email column so existing employee rows remain intact; validate the address only when supplied. Store the generated artifact set with a hash of a cryptographically random token in a department-scoped delivery table. An anonymous redemption endpoint calls a narrowly granted security-definer SQL function that atomically returns and deletes one unexpired delivery. A cleanup schedule removes unredeemed expired artifacts. The email contains a URL fragment token, so ordinary page fetches do not redeem it; an explicit recipient action posts the token for redemption. A server-only relay adapter sends only the recipient, subject, and text link when relay configuration is present.

## Critical Implementation Details

The redemption must be a single database operation that consumes the token and returns all artifacts together; separate per-file token redemption would strand the remaining files. The recipient page must not redeem on GET. The URL fragment is passed to the server only after an explicit button action, then removed from browser history. Delivery rows contain generated employee data and must be deleted after redemption, expiry cleanup, or relay failure.

## Phase 1: Add employee email data

### Overview

Add an optional work email field end to end while preserving existing employee rows that have no address.

### Changes Required:

#### 1. Employee schema and services

**File**: `supabase/migrations/20261002000000_employee_email.sql`, `src/types.ts`, `src/lib/services/employees.ts`

**Intent**: Add optional email to the employee contract and persistence without fabricating addresses for existing employees. Operators can create employees before a recipient address is known.

**Contract**: `EmployeeDTO.email` is nullable and `CreateEmployeeInput.email` is optional. When supplied, email is validated. The migration adds a nullable `employees.email` column and does not delete or rewrite employee records. Updates may set or clear email, and omission preserves the existing value.

#### 2. Employee forms and API validation

**File**: `src/components/employees/AddEmployeeForm.tsx`, `src/components/employees/EmployeeTable.tsx`, `src/pages/api/employees/index.ts`, `src/pages/api/employees/[id].ts`

**Intent**: Capture and display an address when available, and validate it on the server as well as in the form.

**Contract**: New employee creation accepts a missing address and rejects an invalid non-empty address with field errors. Editing supports adding or clearing an address; the list displays it when present.

### Success Criteria:

#### Automated Verification:

- Migration applies without deleting existing employee rows; existing rows retain `email IS NULL` until updated.
- Smoke coverage verifies create accepts missing and valid email, rejects an invalid non-empty address, and update can set or clear an address.
- `npx astro check` and `npm run lint` pass.

#### Manual Verification:

- Create employees with and without an email; reject an invalid non-empty address with a field-level error.
- An existing employee without email remains visible and can be edited to add or clear one.

## Phase 2: Build protected one-time downloads

### Overview

Add department-scoped delivery records and an unauthenticated recipient flow that releases the complete generated artifact set once.

### Changes Required:

#### 1. Delivery storage, access policies, redemption, and cleanup

**File**: `supabase/migrations/20261002000100_signature_deliveries.sql`

**Intent**: Store generated files only for the link's lifetime and make redemption atomic, private by default, and independent of service-role credentials.

**Contract**: The table stores the employee/department relationship, a SHA-256 hash of a 256-bit random token, all artifact contents, creation time, and expiry. Authenticated inserts are limited by the caller's employee department. An RPC callable by `anon` and `authenticated` atomically deletes and returns the matching unexpired artifact bundle; direct table reads are not granted. A scheduled database cleanup deletes expired unredeemed rows.

#### 2. Recipient redemption API and page

**File**: `src/pages/api/signature-download/redeem.ts`, `src/pages/download-signatures.astro`, recipient UI component under `src/components/signatures/`

**Intent**: Let an employee without an app account explicitly retrieve the files while keeping link scanners and ordinary page loads from consuming the token.

**Contract**: The email link places the token in the URL fragment. A GET renders the landing page without redeeming. A user-initiated POST hashes the token and invokes the atomic RPC; valid tokens return every artifact once with `Cache-Control: no-store`, while missing, expired, and redeemed tokens return the same non-enumerating unavailable response. The page removes the fragment after redemption and offers separate downloads from the returned in-memory bundle.

### Success Criteria:

#### Automated Verification:

- Smoke tests verify department-scoped creation, valid redemption, token replay rejection, expired-token rejection, and that anonymous users cannot read delivery rows directly.
- Concurrent redemption attempts yield one successful artifact response; all others receive the unavailable response.
- `GET /download-signatures#token` does not consume a token; redemption responses use `Cache-Control: no-store`.
- `npx astro check`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- Open a fresh link without logging in; the landing page does not redeem until the explicit download action.
- After redemption, download all three artifacts; reopening the link reports it is no longer available.

## Phase 3: Send through the company relay

### Overview

Add a server-only mail adapter and an explicit operator action to issue a link and email it to the employee.

### Changes Required:

#### 1. Relay service and configuration

**File**: `src/lib/services/email-relay.ts`, `astro.config.mjs`, `.env.example`, `README.md`

**Intent**: Send the message using the approved company HTTPS relay without introducing a vendor SDK or exposing credentials to the browser.

**Contract**: Server-only `EMAIL_RELAY_URL`, `EMAIL_RELAY_TOKEN`, and `PUBLIC_APP_URL` configure the integration. The adapter makes a non-redirecting HTTPS `POST /send` request with bearer authorization and JSON `{ to, subject, text }`; it does not send generated files or log personal data, authorization headers, or provider response bodies. Missing configuration, non-2xx responses, and timeouts produce safe, actionable errors.

#### 2. Authenticated issue-and-send endpoint

**File**: `src/pages/api/employees/[id]/send-signatures.ts`, `src/lib/services/signatures.ts`, `src/lib/services/employees.ts`

**Intent**: Generate the current employee's artifacts, create a one-time delivery, then send its link through the company relay.

**Contract**: Only an authenticated user who can read the employee through RLS may issue delivery. The recipient comes from the stored employee email, never request input. The token is random, its hash alone is stored, and expiry is 24 hours. A failed relay call revokes/deletes the pending delivery. Missing email or relay configuration returns a safe error before creating a usable link; manual file downloads remain available.

#### 3. Operator send action

**File**: `src/components/employees/EmployeeTable.tsx`

**Intent**: Give the operator a deliberate send action while preserving the existing local-download action.

**Contract**: A distinct action sends signatures only when the employee has a stored email and the company relay is configured. Otherwise it is disabled with an explanation, while manual downloads remain enabled. The action shows pending/success/failure states, prevents repeat clicks during a request, and never sends automatically on employee creation.

### Success Criteria:

#### Automated Verification:

- A mocked relay test verifies the exact request contract and that generated files are absent from the relay payload.
- Tests cover missing server configuration, rejected relay responses, timeout, and cleanup/revocation of a link after send failure.
- API tests verify unauthenticated and cross-department send attempts are rejected and recipient input cannot be overridden by request data.
- `npx astro check`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- With an approved relay configured, send to an employee email and confirm one message arrives with the link and clear instructions.
- A relay failure is shown to the operator and its link cannot be redeemed.

## Phase 4: Verify delivery and handoff

### Overview

Verify the complete flow and document the relay contract and required environment configuration.

### Changes Required:

#### 1. End-to-end checks and setup documentation

**File**: `scripts/smoke.mjs`, `README.md`, `.env.example`

**Intent**: Make the local mock-relay flow repeatable and document the production prerequisites without recording secrets.

**Contract**: Automated checks cover create/update, send request, recipient redemption, expiry/replay, RLS isolation, and relay failure. Documentation describes the `POST /send` payload, HTTPS and bearer requirements, the three server variables, and that their values must be configured through local/deployment secret stores.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes against local Supabase and a mock HTTPS relay.
- `npx astro check`, `npm run lint`, and `npm run build` pass.
- CI runs the updated smoke flow without a production mail relay or real recipient.

#### Manual Verification:

- Complete the flow using the approved company relay and a test employee mailbox; verify the link expires after 24 hours and cannot be redeemed twice.
- Verify an employee from another department cannot issue or redeem the delivery.

## Testing Strategy

### Unit Tests:

- Validate email parsing and the relay request contract, including redirect rejection, non-2xx, timeout, and missing configuration.
- Validate high-entropy token generation and SHA-256 storage without exposing the raw token in database rows.

### Integration Tests:

- Extend `scripts/smoke.mjs` for optional email, department-scoped token issuance, atomic one-time redemption, expiry, cleanup, and relay failure.
- Use a local mock HTTPS relay; never send tests to an external provider or a real employee address.

### Manual Testing Steps:

1. Create a test employee with or without an email; send only when an address and relay are configured.
2. Open the recipient link while signed out; confirm GET does not redeem and explicit redemption returns Outlook HTML, PowerShell installer, and launcher.
3. Try the link again and after expiry; both attempts must be unavailable.
4. Attempt to issue a link from another department and verify no employee data is disclosed.

## Performance Considerations

The generated Outlook HTML embeds logo bytes, so a delivery row can be several megabytes for the largest accepted logo. Keep the endpoint response and delivery inserts single-bundle operations, enforce the existing logo size limit, and avoid logging artifact content.

## Migration Notes

Email is optional on new and existing records; when supplied, it is validated. Email delivery is available only when the employee has an address and the relay is configured. The delivery migration creates an isolated table and cleanup schedule; it does not delete employee, profile, department, or logo data.

## References

- Research: `context/changes/email-signature-scripts-to-employee/research.md`
- Product requirements: `context/foundation/prd.md` (US-01, FR-006, FR-007, privacy guardrail)
- Employee persistence/RLS: `src/lib/services/employees.ts`, `supabase/migrations/20260922193159_department_scoped_data_foundation.sql`
- Signature generation: `src/lib/services/signatures.ts`, `src/pages/api/employees/[id]/signatures.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.github/skills/10x-plan/references/progress-format.md`.

### Phase 1: Add employee email data

#### Automated

- [x] 1.1 Migration preserves existing employees with null email and applies cleanly.
- [x] 1.2 Smoke verifies optional email on create, rejects malformed email, and supports setting/clearing email.
- [ ] 1.3 `npx astro check` and `npm run lint` pass.

#### Manual

- [ ] 1.4 Create employees with and without an email; add and clear an address on an existing row.

### Phase 2: Build protected one-time downloads

#### Automated

- [x] 2.1 Smoke verifies department-scoped issuance, anonymous table denial, valid redemption, expiry, and replay rejection.
- [x] 2.2 Concurrent redemption yields one successful response; GET does not consume; redemption is no-store.
- [ ] 2.3 `npx astro check`, `npm run lint`, and `npm run build` pass.

#### Manual

- [x] 2.4 Signed-out recipient explicitly redeems once and downloads all three generated artifacts.

### Phase 3: Send through the company relay

#### Automated

- [x] 3.1 Mock relay verifies HTTPS request contract, no artifact payload, and safe handling of configuration, failure, timeout, and redirects.
- [ ] 3.2 Authenticated send uses the stored recipient, enforces RLS, and revokes a pending link on send failure.
- [ ] 3.3 `npx astro check`, `npm run lint`, and `npm run build` pass.

#### Manual

- [ ] 3.4 Configured company relay delivers instructions and a link; relay failure is visible and leaves no usable link.

### Phase 4: Verify delivery and handoff

#### Automated

- [ ] 4.1 `npm run smoke` passes with a local mock relay and no external email delivery.
- [ ] 4.2 `npx astro check`, `npm run lint`, and `npm run build` pass; CI smoke works without production mail credentials.

#### Manual

- [ ] 4.3 Test mailbox verifies full delivery, 24-hour expiry, one-time use, and cross-department isolation.
