# Generate New Outlook and Thunderbird Signature Artifacts Implementation Plan

## Overview

Add a per-employee action that generates a New Outlook signature HTML artifact and a Windows Thunderbird installer. The generated content uses the employee's data and their department's private logo; New Outlook activation is a deliberate Settings step, and email delivery remains in S-05.

## Current State Analysis

- `EmployeeDTO` contains first name, last name, position, phone, and timestamps; it has no email field (`src/types.ts:4`).
- Employee CRUD is in `src/lib/services/employees.ts`; routes in `src/pages/api/employees/` use `context.locals.user`, a request-scoped Supabase client, and RLS-backed service queries.
- `/employees` renders the `EmployeeTable` React island. Each row already has edit/delete actions (`src/components/employees/EmployeeTable.tsx:156`); no signature-generation action exists.
- The department logo is stored in a private Supabase Storage bucket. `getDepartmentLogoUrl` returns a signed URL with a 3,600-second TTL (`src/lib/services/departments.ts:6,48,74`); a durable signature must not reference that URL.
- `scripts/smoke.mjs` is the only automated integration check and already tests authenticated employee operations, department isolation, and logo upload/remove flows.
- There is no mail delivery or signature-generation dependency in `package.json`. Email is explicitly downstream in S-05.
- Microsoft's New Outlook instructions create and save signatures through Settings > Accounts > Signatures. Microsoft Graph's documented `mailboxSettings` resource has no signature property; COM/VSTO add-ins are unsupported in New Outlook. The supported New Outlook outcome in this plan is ready-to-use content plus the accepted manual Settings step.

### Key Discoveries:

- Employee rows are already the per-record action surface; the existing API/service pattern keeps the caller's department inferred by authentication and RLS (`src/components/employees/EmployeeTable.tsx:156`, `src/lib/services/employees.ts:50`, `src/pages/api/employees/[id].ts:31`).
- The logo upload accepts PNG, JPEG, and SVG up to 2MB; S-03 deliberately deferred signature compatibility to this slice (`src/components/departments/DepartmentLogoManager.tsx:7-8`, `context/archive/2026-09-27-set-department-logo/plan-brief.md`).
- The employee DTO lacks an email address, so the Thunderbird installer must ask the employee to select an account rather than infer one (`src/types.ts:4`).
- New Outlook manual setup and this slice's client scope are recorded in `context/changes/generate-signature-scripts/frame.md`.

## Desired End State

A help desk user can request both artifacts for an employee from that employee's row. The authenticated API returns a ready-to-save HTML signature for New Outlook and a Windows PowerShell installer for Thunderbird; the installer lets the employee select the account to configure. The generated content includes the current department logo without relying on a public or expiring URL, and a missing logo produces a text-only signature. Neither artifact is persisted by the app or emailed from this slice.

Verify through smoke coverage for same-department access, cross-department rejection, generated content, and no-logo behavior; then manually configure and inspect the signature in both real clients. Both client checks are required before S-04 is marked done.

## What We're NOT Doing

- Emailing the employee or storing generated artifacts; those belong to S-05.
- Silently provisioning or editing undocumented New Outlook state; the employee saves the generated content through New Outlook Settings.
- Supporting classic Outlook, macOS/Linux Thunderbird installers, multiple Thunderbird accounts at once, or a company-wide signature policy.
- Adding an employee email field or selecting a Thunderbird account from server-side employee data.
- Using public image URLs or the current expiring signed URL in a generated signature.

## Implementation Approach

Add a server-side signature service and an authenticated employee-scoped API route. The service reads the employee through the request-scoped Supabase client, obtains the caller department's logo bytes through private Storage access, and returns two generated strings without writing a database row or object. The employee table calls the route and downloads the two named artifacts as browser Blobs. The Thunderbird PowerShell script is self-contained, targets Windows, presents available profiles/accounts for an explicit choice, and only changes the selected account after a safe backup. Dynamic employee fields must be HTML-escaped; script payload data must be encoded rather than interpolated as executable PowerShell source.

## Critical Implementation Details

The existing logo URL expires after one hour, so generated artifacts must use bytes obtained under the caller's Storage RLS and must not include any Supabase URL. Validate the image representation in both actual clients; if it cannot remain self-contained, use a local asset installed with the Thunderbird signature and the New Outlook Settings image workflow rather than weakening the privacy boundary. The installer must make no changes if the user cancels, the selected profile/account cannot be resolved, or Thunderbird is running; when it proceeds, preserve a restorable copy of the profile settings it changes.

## Phase 1: Generate protected signature artifacts

### Overview

Build the server-side data and generation path for both artifacts, enforce department scoping, and cover its response contract in the existing smoke test.

### Changes Required:

#### 1. Logo bytes and signature generation service

**File**: `src/lib/services/departments.ts`, `src/lib/services/signatures.ts` (new)

**Intent**: Extend the department service to read the caller department's stored logo key and private object bytes, then centralize generation of the New Outlook HTML and Thunderbird installer. Avoid signed URLs so the generated artifacts remain usable after the current one-hour URL expires.

**Contract**: The logo lookup returns `null` when no logo is configured or a typed byte payload with its validated MIME type. The generator accepts an RLS-visible `EmployeeDTO` and optional logo payload and returns `{ outlookHtml, thunderbirdInstaller }`. It inserts employee values as escaped text, does not include external asset URLs, and creates text-only outputs when no logo exists.

#### 2. Authenticated employee signature endpoint

**File**: `src/pages/api/employees/[id]/signatures.ts` (new)

**Intent**: Add the request boundary used by the employee table to generate both outputs for one employee. Follow existing auth, request-scoped Supabase, JSON error, and `prerender = false` conventions.

**Contract**: `POST /api/employees/:id/signatures` returns JSON containing `outlookHtml` and `thunderbirdInstaller` for an employee visible to the caller. Anonymous requests return 401; an unknown or other-department employee returns 404; configuration or generation errors return 500. Responses containing employee data use `Cache-Control: no-store`. No client-supplied department id is accepted.

#### 3. Generator smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Extend the existing authenticated two-department smoke flow to prove artifact contents and the route's isolation boundary.

**Contract**: Assert that the owning user receives both artifacts with employee fields escaped and the configured logo included without a remote Supabase URL; an employee with no department logo receives text-only output. Assert anonymous access returns 401 and a different department's employee id returns 404. Do not run the generated PowerShell script on the app server.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes the new authenticated generation, escaping, logo/no-logo, and cross-department cases.
- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds for the Cloudflare Worker target.

## Phase 2: Add per-employee generation and downloads

### Overview

Expose generation from the existing employee row and download both generated artifacts with clear loading and error states.

### Changes Required:

#### 1. Employee row action

**File**: `src/components/employees/EmployeeTable.tsx`

**Intent**: Add a `Generate signatures` action to each non-editing employee row, reusing its existing per-row action surface and request/error patterns.

**Contract**: The action calls `POST /api/employees/:id/signatures`, prevents duplicate requests while pending, and reports a recoverable row-level error on failure. On success it downloads a sanitized employee-specific `.html` file for New Outlook and a `.ps1` file for Thunderbird, then releases any created object URLs. It does not navigate away or modify employee data.

#### 2. Shared response type

**File**: `src/types.ts`

**Intent**: Keep the artifact response shape typed at the client/API boundary.

**Contract**: Define a camelCase DTO matching the endpoint's two string fields; do not add an employee email or other database field.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- From `/employees`, generating for a row downloads exactly the New Outlook HTML and Thunderbird PowerShell artifacts with sanitized filenames.
- Pending, failure, and retry states remain understandable and do not allow duplicate generation requests.

**Implementation Note**: After automated verification, pause for human confirmation of the manual checks before starting Phase 3.

## Phase 3: Verify real-client behavior and close the slice

### Overview

Run the complete automated gates and prove the output can be activated in the selected clients, including logo and cancellation behavior.

### Changes Required:

#### 1. Final integration and client verification

**File**: `scripts/smoke.mjs`, generated artifacts from Phase 1

**Intent**: Verify the finished UI/API flow and close the compatibility risks that cannot be proven by static checks alone.

**Contract**: Keep the automated smoke assertions for authentication, same-department generation, cross-department denial, HTML escaping, and no-logo output. Manual checks cover New Outlook for Windows and Thunderbird for Windows; both are required to mark S-04 done.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes the full auth, employee, logo, and signature-generation flow.
- `npx astro check`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- In New Outlook for Windows, save the generated signature through Settings and verify the employee fields and department logo appear in a new message and a reply.
- On Windows with Thunderbird, run the installer, select the intended profile/account, and verify the signature appears only on that account; confirm cancellation or a failed precondition leaves the profile unchanged and an applied change has a restorable backup.
- Verify the New Outlook and Thunderbird outputs render the selected PNG, JPEG, or SVG logo without loading an external URL; verify no-logo output remains readable text.

## Testing Strategy

- **Unit tests**: No unit-test runner exists in this repository. Keep generator response assertions in the existing dependency-free `scripts/smoke.mjs` rather than adding a second test framework for this slice.
- **Integration tests**: Extend smoke coverage for authenticated artifact generation, HTML escaping, no-logo output, and cross-department 404 behavior.
- **Manual tests**: Use real New Outlook for Windows and Thunderbird for Windows. Exercise logo and no-logo cases, account choice, cancel/failure safety, and verify the signature in composed messages.

## Performance Considerations

Generation is request-scoped and does not persist artifacts. A department logo is capped at 2MB; avoid unnecessary repeated Storage downloads within one generation request. Keep the complete operation within the PRD's few-seconds feedback requirement and display progress in the row action.

## Migration Notes

No database migration or employee schema change is required. Generated files and profile changes are created only when requested; the app does not retain generated copies.

## References

- Frame brief and settled decisions: `context/changes/generate-signature-scripts/frame.md`.
- Employee DTO and service patterns: `src/types.ts:4`, `src/lib/services/employees.ts:30,50`, `src/pages/api/employees/[id].ts:6,31`.
- Employee action surface: `src/components/employees/EmployeeTable.tsx:156`.
- Private logo and expiry: `src/lib/services/departments.ts:6,48,74`; S-03 deferred logo embedding in `context/archive/2026-09-27-set-department-logo/plan-brief.md`.
- Existing smoke harness: `scripts/smoke.mjs:36,138`.
- New Outlook workflow: https://support.microsoft.com/en-us/outlook/mail/how-to-add-and-change-an-email-signature-in-outlook
- Microsoft Graph mailbox settings: https://learn.microsoft.com/en-us/graph/api/resources/mailboxsettings?view=graph-rest-1.0
- Outlook add-in limitations: https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/compose-scenario

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.github/skills/10x-plan/references/progress-format.md`.

### Phase 1: Generate protected signature artifacts

#### Automated

- [x] 1.1 `npm run smoke` covers generated outputs, escaping, missing logo, and cross-department denial — f8d3eba
- [x] 1.2 `npx astro check` and `npm run lint` pass
- [x] 1.3 `npm run build` succeeds for Cloudflare Workers — f8d3eba

### Phase 2: Add per-employee generation and downloads

#### Automated

- [ ] 2.1 `npx astro check` and `npm run lint` pass
- [ ] 2.2 `npm run build` succeeds

#### Manual

- [ ] 2.3 Row action downloads both correctly named artifacts and handles pending, failure, and retry states

### Phase 3: Verify real-client behavior and close the slice

#### Automated

- [ ] 3.1 Full `npm run smoke` passes
- [ ] 3.2 `npx astro check`, `npm run lint`, and `npm run build` pass

#### Manual

- [ ] 3.3 New Outlook saves and renders the generated signature with logo in new and reply messages
- [ ] 3.4 Thunderbird installer configures only the selected account, preserves cancellation/failure state, and creates a restorable backup
- [ ] 3.5 Both clients render supported logo types without external URLs, and no-logo output remains readable
