---
project: "Email Signature Tool"
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-10-30
  after_hours_only: true
created: 2026-09-17
updated: 2026-09-17
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction + missing self-service capability"
    - topic: "persona scope"
      decision: "specific role inside an org (help desk / IT)"
    - topic: "auth strategy"
      decision: "login (email+password) with department-scoped row-level access; no super-admin role requested"
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

Help desk / IT staff at a company lose time manually setting up email signatures for newly hired employees; some new employees cannot configure this themselves. The insight: today everyone does this by hand, some people can't manage it, and simply sending a link to a ready-made script would make the process much simpler — no one has built this self-service shortcut yet.

## User & Persona

**Primary persona:** Help desk / IT staff member — a specific role inside the company's organization. They encounter this pain point during employee onboarding, when a new hire needs an email signature configured (name, surname, position, phone) and, optionally, a company logo/graphic. Today this either requires manual setup by IT or a failed self-attempt by the new employee that generates a support request.

## Success Criteria

### Primary
- A help desk/IT user logs in, adds a new employee's data (first name, last name, phone, position, and a logo/graphic), the system generates signature-setup scripts for the employee's mail client (Outlook and Thunderbird), emails the new employee with instructions and a download link, and the new employee runs the script to have their signature configured correctly.

### Secondary
- None specified.

### Guardrails
- The generated script and underlying data must never transmit employee data anywhere outside the company's own server.
- A logged-in user must never be able to view or access employee records belonging to a department other than their own.

## User Stories

### US-01: Help desk/IT creates an email signature for a new employee

- **Given** a logged-in help desk/IT staff member with permissions scoped to their own department
- **When** they add a new employee (first name, last name, position, phone) and request script generation — both an Outlook script and a Thunderbird script are generated together, using the logo/graphic configured for the employee's department
- **Then** the system generates both scripts and emails the new employee with a download link

#### Acceptance Criteria
- Both the Outlook script and the Thunderbird script must correctly set the signature with the provided data and the department's graphic
- The email contains clear instructions for running the scripts
- The employee record is visible only to users from the same department

## Functional Requirements

- FR-001: Help desk/IT staff member can log in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Without solid authentication, employee data is exposed." Resolution: kept as written — email+password login stands as the MVP's authentication mechanism.
- FR-002: Help desk/IT staff member can add a new employee record (first name, last name, position, phone, department). Priority: must-have
  > Socrates: Counter-argument considered: "Too many fields to start — the logo/graphic should belong to a department, not each individual employee." Resolution: revised — the logo/graphic moved to a department-level setting (see FR-008); removed from the per-employee record.
- FR-003: Help desk/IT staff member can view, edit, and delete employee records — scoped to their own department only. Priority: must-have
  > Socrates: Counter-argument considered: "Employees sometimes change departments — no cross-department access will make transferring a record harder." Resolution: kept as written for MVP; cross-department transfer is out of scope for now (see Open Questions).
- FR-004: System generates a PowerShell script setting the email signature for Outlook, based on the employee record. Priority: must-have
  > Socrates: Counter-argument considered: "Different Outlook versions (classic vs. new Outlook) have different configuration mechanics — one script may not work everywhere." Resolution: kept as written; exact Outlook version support is routed to Open Questions.
- FR-005: System generates a PowerShell script setting the email signature for Thunderbird, based on the employee record. Priority: must-have
  > Socrates: Counter-argument considered: "It may be better to start with a single mail client and add the second later." Resolution: kept — both Outlook and Thunderbird scripts remain in MVP scope.
- FR-006: System emails the new employee with instructions and a download link for both signature scripts. Priority: must-have
  > Socrates: Counter-argument considered: "The email could land in spam, or the new employee may not yet have an active mailbox on day one." Resolution: kept as written; this risk is noted but does not block the MVP flow.
- FR-007: New employee downloads and runs a script, which configures their email signature. Priority: must-have
  > Socrates: Counter-argument considered: "Running an unknown PowerShell script is a security concern — company policy may block unsigned scripts." Resolution: kept as written; script signing/execution policy is routed to Open Questions.
- FR-008: Help desk/IT staff member can set or update a logo/graphic for their own department, used across all employee signatures generated for that department. Priority: must-have

## Non-Functional Requirements

- A newly submitted employee record and both generated scripts are available to the help desk/IT user within a few seconds of submission, with visible feedback while generation is in progress.
- Employee data (including logos) is never transmitted anywhere outside the company's own server.
- A user can never view or act on employee records belonging to a department other than their own, even via a crafted request.

## Business Logic

The system selects the signature's logo/graphic according to the employee's department and validates the phone number format, warning the user without blocking submission if it does not conform.

The rule consumes the employee's department (to pick the correct logo/graphic for the generated signature) and the phone number the help desk/IT user enters (checked against an expected format). Its output is a pair of ready-to-run signature scripts branded with the correct department logo, plus an inline warning if the phone number looks malformed. The help desk/IT user encounters this at the moment they submit a new employee's data: the department's logo is applied automatically without any extra selection step, and a warning appears next to the phone field if the format looks wrong — but does not prevent them from proceeding.

## Access Control

Login (email + password). Each user account belongs to a department. A logged-in user can view and manage only the employee records belonging to their own department — this is a row-level scoping rule, not a full role hierarchy. No overarching admin role (visible across all departments) was requested; this can be revisited if a cross-department admin need emerges.

## Non-Goals

- No integration with AD/HR to automatically pull employee data — all data is entered manually by help desk/IT. Rationale: keeps MVP scope contained; integration is a future enhancement.
- No ability to transfer an employee record between departments in the MVP. Rationale: department-scoped access is the MVP's access model; transfer support is deferred.
- No confirmation/status tracking of whether the new employee actually ran the script. Rationale: keeps the MVP flow to generation + email delivery only.
- No support for mail clients other than Outlook and Thunderbird (e.g., Apple Mail, Gmail web). Rationale: covers the two clients actually in use; broader support is a future enhancement.
- No administrator role that can see all departments at once. Rationale: department-scoped access is sufficient for the MVP; a cross-department admin role is deferred.
- No PowerShell script signing or handling of restrictive ExecutionPolicy configurations. Rationale: out of scope for MVP; flagged as an open question for environments with strict policies.

## Open Questions

1. **Does the target environment enforce a restrictive PowerShell ExecutionPolicy or require script signing?** — Owner: user (with IT security). By: before build starts, since it affects whether FR-007 works as designed.
2. **Which Outlook version(s) must the signature script support (classic vs. new Outlook)?** — Owner: user. By: before FR-004 is implemented.
3. **What counts as a valid phone number format for validation purposes (country code, format)?** — Owner: user. By: before FR-002/Business Logic validation is implemented.

## Quality cross-check

No gaps found — all cross-check elements (Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, Non-Goals) were present at closing review.
