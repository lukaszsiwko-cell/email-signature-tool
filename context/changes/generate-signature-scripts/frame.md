# Frame Brief: S-04 Signature Generation

> Framing step before implementation planning. The user-facing goal is preserved, while the New Outlook automation assumption is separated from verified capability.

## Reported Observation

Roadmap slice S-04 is blocked pending the target Outlook version and script execution policy. The user has now selected New Outlook for Windows and confirmed that unsigned scripts are allowed. The app has employee and department-logo data, but no signature-generation path was found in the inspected code.

## Initial Framing (preserved)

- **User's stated cause or approach**: Generate a signature-setup script for Outlook and Thunderbird from employee data.
- **User's proposed direction**: Proceed with roadmap slice S-04 for New Outlook for Windows and Thunderbird.
- **Pre-dispatch narrowing**: The main pain is entering and formatting the signature data and logo. One manual settings action in New Outlook is acceptable.

## Dimension Map

1. **Signature content generation** — employee data and the correct department logo must become valid client-compatible signature content.
2. **New Outlook activation** — the initial framing assumes a local script can install and enable a default signature.
3. **Logo persistence and privacy** — the existing logo service returns an expiring private signed URL, which may not work as a durable signature asset.
4. **Workflow boundary** — S-04 generates the artifacts; S-05 separately emails them to the employee.

## Hypothesis Investigation

| Hypothesis                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                   | Verdict |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Signature generation is not present in the inspected app paths. | The inspected employee service and API handle employee CRUD; the employees page loads employees and a logo URL; no signature or mail-generation dependency appeared in the inspected package manifest or source search.                                                                                                                                    | STRONG  |
| New Outlook can be configured by a standalone setup script.     | Microsoft's documented New Outlook flow creates and saves a signature through Settings > Accounts > Signatures. The documented Graph `mailboxSettings` fields contain no signature setting. Microsoft says COM/VSTO add-ins are unsupported in New Outlook; web add-ins run in Outlook's webview and are not documented as default-signature provisioning. | WEAK    |
| A signed logo URL is a suitable permanent signature asset.      | The department service creates a signed URL with a 3,600-second TTL for the private `department-logos` bucket. The S-03 brief explicitly deferred whether that URL can be used in generated scripts.                                                                                                                                                       | NONE    |
| Email delivery belongs in S-04.                                 | PRD US-01 and FR-006 assign email delivery to the next workflow stage; the roadmap makes S-05 depend on S-04.                                                                                                                                                                                                                                              | NONE    |

## Narrowing Signals

- The user identified data and logo entry/formatting as the primary current pain, rather than navigation through Outlook settings.
- The user accepts one manual settings action in New Outlook; automatic default activation is not a required success condition.
- The user selected New Outlook for Windows and confirmed unsigned scripts are allowed.

## Cross-System Convention

Microsoft's current support instructions for New Outlook describe creating, saving, and selecting signatures through the app's Settings UI. The Graph `mailboxSettings` resource does not list a signature property, and Microsoft documents COM/VSTO as unsupported in New Outlook. This evidence does not prove that no tenant-specific or future mechanism exists, so the plan must not claim one without separate verification.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: Generate correct, client-compatible signature content from an employee's data and department logo, with New Outlook activation allowed to require one manual settings action.

The user's primary pain is preparing and formatting the signature, and one manual activation step is acceptable. Current Microsoft documentation does not establish a supported standalone setup script for New Outlook, so automatic installation should not be promised. The logo must also remain usable without relying on its one-hour signed URL.

## Confidence

- **MEDIUM** — official Microsoft documentation confirms the supported UI workflow and the documented Graph shape, but the practical New Outlook HTML/image handoff and Thunderbird setup still need validation.

## What Changes for /10x-plan

Plan for generating both client-specific artifacts and clear activation instructions, not for emailing them (S-05) or silently editing undocumented New Outlook state. Validate how the department logo is embedded or delivered so each signature remains usable after the signed URL expires.

## References

- Source files: `context/foundation/roadmap.md` (S-04/S-05); `context/foundation/prd.md` (US-01, FR-004–FR-007, Non-Goals); `src/lib/services/employees.ts`; `src/lib/services/departments.ts:74`; `src/pages/employees.astro:20`; `package.json`.
- Related history: `context/archive/2026-09-27-set-department-logo/plan-brief.md` (logo embedding deferred to S-04).
- Microsoft Support: https://support.microsoft.com/en-us/outlook/mail/how-to-add-and-change-an-email-signature-in-outlook
- Microsoft Graph: https://learn.microsoft.com/en-us/graph/api/resources/mailboxsettings?view=graph-rest-1.0
- Outlook add-ins: https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/compose-scenario
- Investigation tasks: none (local and official-documentation checks were performed in the primary session).
