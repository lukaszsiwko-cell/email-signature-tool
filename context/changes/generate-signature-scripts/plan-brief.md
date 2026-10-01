# Generate New Outlook and Thunderbird Signature Artifacts — Plan Brief

> Full plan: `context/changes/generate-signature-scripts/plan.md`
> Frame brief: `context/changes/generate-signature-scripts/frame.md`

## What & Why

Generate correct, client-compatible signature content from an employee's data and department logo, with New Outlook activation allowed to require one manual Settings step. The primary pain is preparing and formatting the content; the app should not promise unsupported silent provisioning.

## Starting Point

`/employees` already lists RLS-scoped employee rows and the department logo manager stores logo assets in a private Supabase Storage bucket. There is no signature generator or mail-delivery integration, and the signed logo URL expires after one hour.

## Desired End State

A help desk user can request two artifacts from an employee row: ready-to-save HTML for New Outlook and a Windows PowerShell installer for Thunderbird. The Thunderbird installer asks the employee to choose a profile/account; both outputs use the selected department's logo without a public or expiring URL. Email delivery stays in S-05.

## Key Decisions Made

| Decision                      | Choice                                                           | Why                                                                                                        | Source        |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| Outlook target                | New Outlook for Windows; one manual Settings step is acceptable  | Microsoft's documented New Outlook flow is user-driven and no documented Graph signature setting was found | Frame         |
| Script execution policy       | Unsigned scripts are allowed by IT                               | This was confirmed as a prerequisite for S-04                                                              | Frame         |
| Thunderbird installer OS      | Windows only                                                     | Aligns with the selected New Outlook target and avoids three profile/platform implementations              | Plan          |
| Thunderbird account selection | Ask the employee to select the account                           | Employee records have no email field, so the app cannot reliably infer an identity                         | Plan          |
| Logo handling                 | Use private Storage bytes; never embed a signed/public URL       | The current signed URL expires after one hour and must not become a durable email asset                    | Frame / Plan  |
| Client verification           | Real-client checks in both apps are required before S-04 is done | Static checks cannot prove profile changes, activation, or rendered logo behavior                          | Plan          |
| Email delivery                | Out of scope; remains S-05                                       | Keeps this slice to generation and local client setup                                                      | Roadmap / PRD |

## Scope

**In scope:** per-employee generate action; authenticated same-department API; New Outlook HTML output; Windows Thunderbird installer with explicit account selection; private logo bytes; smoke coverage and manual verification in both clients.

**Out of scope:** email delivery, classic Outlook, non-Windows Thunderbird installers, adding employee email, profile-wide installation, and external logo hosting.

## Architecture / Approach

An authenticated endpoint reads the selected employee through the caller's RLS-scoped Supabase client, loads the caller department's logo bytes from private Storage, and returns both generated artifact strings without persisting them. The employee row action downloads the New Outlook HTML and Thunderbird PowerShell file. The installer prompts for the Thunderbird account, changes only that account, and keeps a restorable backup.

## Phases at a Glance

| Phase                   | What it delivers                                         | Key risk                                                             |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Protected generation | Employee-scoped API and both artifact generators         | Client-compatible logo representation and safe profile configuration |
| 2. Row action           | UI action, loading/error states, and two downloads       | Avoid duplicate requests and unsafe filenames                        |
| 3. Client verification  | Smoke gates plus real New Outlook and Thunderbird checks | Installer must not damage or alter the wrong profile                 |

**Prerequisites:** S-01, S-03, and the confirmed New Outlook/policy decisions are complete.
**Estimated effort:** ~2-3 sessions across 3 phases; client compatibility may determine iteration count.

## Open Risks & Assumptions

- New Outlook HTML and embedded/local image behavior must pass a real-client check; a remote signed URL is not an acceptable fallback.
- Thunderbird profile/account discovery and safe preference updates must be verified on Windows; cancellation and failed preconditions must leave the profile unchanged.
- PNG, JPEG, and SVG are accepted by the logo manager, but each must be tested in both target clients.

## Success Criteria (Summary)

- A same-department user can generate both files for an employee, while unauthenticated and cross-department requests are rejected.
- The outputs contain the employee's data and department logo, or readable text-only content when no logo is set, without external logo URLs.
- The signature is activated and rendered correctly in New Outlook and Thunderbird for Windows; both manual client checks are required before S-04 closes.
