---
project: "Email Signature Tool"
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-28
prd_version: 1
main_goal: speed
top_blocker: decisions
milestone_id: first-signature-delivery-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: Email Signature Tool

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First signature delivery loop** — Status: open

- **Intent:** Prove the MVP's core hypothesis end-to-end — a help desk/IT user can add a new employee, the system generates correct Outlook + Thunderbird signature scripts branded with the department logo, and the new employee receives them by email — while keeping department data strictly isolated.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-008, US-01, NFRs (data isolation, few-seconds feedback), Access Control section.

## Vision recap

Help desk/IT staff at a company lose time manually setting up email signatures for new hires; some new employees can't configure it themselves, which today becomes either manual IT work or a failed self-attempt that turns into a support ticket. The wedge — the one trait that, if removed, makes this just another admin tool — is self-service: a help desk user fills in a short form once, and the new employee gets a ready-to-run script by email instead of a support request.

## North star

**S-05: New employee receives both signature scripts by email and runs one to configure their signature.** — This is the literal Primary Success Criterion from the PRD: the full loop (add employee → generate scripts → email delivery → employee runs script) is what proves the tool actually removes the manual/failed-self-attempt pain, not just a piece of it.

> North star — the smallest end-to-end slice whose successful delivery proves the core product hypothesis. Everything else in this milestone only matters if this slice, once its prerequisites land, actually works.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                                          | Prerequisites   | PRD refs                         | Status   |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------ | --------------- | --------------------------------- | -------- |
| F-01 | department-scoped-data-foundation   | (foundation) departments/employees schema + RLS + user-department linkage      | —                | FR-001, FR-002, FR-003, Access Control | ready    |
| S-01 | add-and-list-employees              | add a new employee and see the list of employees in their own department       | F-01            | FR-002, FR-003, US-01             | done |
| S-02 | edit-and-delete-employee            | edit or delete an existing employee record in their own department             | S-01             | FR-003                            | done |
| S-03 | set-department-logo                 | set/update the logo/graphic used for their department's signatures             | F-01            | FR-008                            | proposed |
| S-04 | generate-signature-scripts          | generate Outlook + Thunderbird signature scripts for an employee, branded with the department logo | S-01, S-03 (parallel) | FR-004, FR-005, US-01       | blocked  |
| S-05 | email-signature-scripts-to-employee | (new employee) receive both scripts by email with instructions and run one to configure their signature | S-04            | FR-006, FR-007, US-01             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                              | Chain                     | Note                                                                 |
| ------ | ----------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| A      | Zarządzanie pracownikami działu     | `F-01` → `S-01` → `S-02`   | Podstawa danych i CRUD pracowników; nie blokuje reszty przepływu.      |
| B      | Marka działu (logo)                 | `S-03`                     | Zależy od `F-01` (patrz Stream A); dołącza do Stream C przy `S-04`.    |
| C      | Generowanie i dostarczanie podpisu  | `S-04` → `S-05`            | Rdzeń hipotezy produktu (gwiazda przewodnia); dołącza do Stream A przy `S-01`. |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React scaffold wired (layouts, `Topbar`/`Banner`/`Welcome`, shadcn/ui in `src/components/ui/`); no domain UI yet.
- **Backend / API:** partial — only auth API routes exist (`src/pages/api/auth/*`); no domain endpoints.
- **Data:** absent — no employee/department schema or migrations; only Supabase's built-in `auth.users` table.
- **Auth:** present — email+password login wired end-to-end (`src/middleware.ts`, signin/signup/confirm-email pages, `src/lib/supabase.ts`).
- **Deploy / infra:** present — deployed to Cloudflare Workers, secrets configured (`context/deployment/deploy-plan.md`). Currently on Supabase Cloud, not self-hosted — a known gap vs. the PRD's data-residency guardrail, tracked as a Parked item below.
- **Observability:** partial — Cloudflare platform-level observability enabled; no app-level logging/error tracking.

## Foundations

### F-01: Department-scoped data foundation

- **Outcome:** (foundation) `departments` and `employees` tables exist in Supabase with row-level-security policies enforcing department-scoped access; each user account is linked to exactly one department.
- **Change ID:** department-scoped-data-foundation
- **PRD refs:** FR-001 (extends — adds department linkage to the existing login), FR-002, FR-003, Access Control
- **Unlocks:** S-01, S-02, S-03, S-04 (indirectly, via employee/department records they read and write); reduces the NFR guardrail risk ("a user can never view or act on employee records belonging to a department other than their own").
- **Prerequisites:** — (baseline Auth is already present; this foundation extends it with department linkage and domain tables)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Every other item reads/writes employee data through this schema — if RLS policies are wrong, the PRD's hardest guardrail (department data isolation) breaks silently. Sequenced first so every downstream slice inherits a tested isolation boundary rather than each slice re-deriving its own scoping logic.
- **Note:** Scope is being delivered as Phase 1 of the `add-and-list-employees` plan (`context/changes/add-and-list-employees/plan.md`), since S-01 couldn't be scoped without it and F-01 had no separate plan folder. Status below intentionally untouched by that change's roadmap sync (exact Change ID match only) — do not start a separate F-01 plan.
- **Status:** ready

## Slices

### S-01: Add and list employees (own department)

- **Outcome:** Help desk/IT staff member can add a new employee (first name, last name, position, phone) and see the list of employees belonging to their own department.
- **Change ID:** add-and-list-employees
- **PRD refs:** FR-002, FR-003 (view portion), US-01
- **Prerequisites:** F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - What counts as a valid phone number format (country code, format)? — Owner: user. Block: no (Business Logic already specifies: warn on a bad format but never block submission, so a permissive default can ship now and be tightened later).
- **Risk:** Mostly a straightforward CRUD form; the real risk (RLS correctness) is carried by F-01, not this slice.
- **Status:** done

### S-02: Edit and delete employee records

- **Outcome:** Help desk/IT staff member can edit or delete an existing employee record in their own department.
- **Change ID:** edit-and-delete-employee
- **PRD refs:** FR-003 (edit/delete portion)
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — reuses the same data access path validated in S-01; main risk is making sure edit/delete also respect department scoping (inherited from F-01).
- **Status:** done

### S-03: Set department logo

- **Outcome:** Help desk/IT staff member can set or update the logo/graphic used across all signatures generated for their own department.
- **Change ID:** set-department-logo
- **PRD refs:** FR-008
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low complexity, but must never let a department see or overwrite another department's logo — same isolation boundary as F-01, just applied to a file/asset instead of a row.
- **Status:** proposed

### S-04: Generate Outlook + Thunderbird signature scripts

- **Outcome:** Help desk/IT staff member can request script generation for an employee and receive both a working Outlook script and a working Thunderbird script, branded with the employee's department logo.
- **Change ID:** generate-signature-scripts
- **PRD refs:** FR-004, FR-005, US-01
- **Prerequisites:** S-01 (employee record must exist); Parallel with S-03 (department logo may or may not be set yet — script generation must handle an unset logo gracefully)
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Does the target environment enforce a restrictive script-execution policy or require script signing? — Owner: user (with IT security). Block: yes — changes how the scripts must be produced (signed vs. unsigned), so it must resolve before this slice can be planned.
  - Which Outlook version(s) must the script support (classic vs. new Outlook)? — Owner: user. Block: yes — the two versions have different configuration mechanics; the answer changes what the Outlook script actually does.
- **Risk:** This is the riskiest slice in the milestone — two different mail-client mechanics, one of them (Outlook) with a version-dependent implementation. Sequenced right after the data foundation so the two blocking decisions surface early rather than mid-build.
- **Status:** blocked

### S-05: Email signature scripts to the new employee

- **Outcome:** The new employee receives an email with clear instructions and a download link for both signature scripts, and running one script configures their email signature correctly.
- **Change ID:** email-signature-scripts-to-employee
- **PRD refs:** FR-006, FR-007, US-01
- **Prerequisites:** S-04
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Completes the literal Primary Success Criterion — the loop only counts as proven once an email actually lands with a runnable script. Depends entirely on S-04's output being correct, so any drift there surfaces here during verification.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                        |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| F-01       | department-scoped-data-foundation   | Add department-scoped data model (departments, employees, RLS)         | yes                    | —                                                                 |
| S-01       | add-and-list-employees              | Help desk can add and list employees in their own department           | no                     | Wait for F-01 to land                                             |
| S-02       | edit-and-delete-employee             | Help desk can edit and delete employee records                          | no                     | Wait for S-01 to land                                             |
| S-03       | set-department-logo                 | Help desk can set/update the department signature logo                 | no                     | Wait for F-01 to land                                             |
| S-04       | generate-signature-scripts          | Generate Outlook + Thunderbird signature scripts for an employee       | no                     | Blocked — resolve script-execution-policy and Outlook-version open questions first |
| S-05       | email-signature-scripts-to-employee | Email the new employee both signature scripts with instructions        | no                     | Wait for S-04 to land                                             |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. It should be compact enough to copy into issues, but it must not duplicate the detailed roadmap body.

## Open Roadmap Questions

1. **Does the target environment enforce a restrictive script-execution policy or require script signing for the generated setup scripts?** — Owner: user (with IT security). Block: S-04.
2. **Which Outlook version(s) must the signature script support (classic vs. new Outlook)?** — Owner: user. Block: S-04.
3. **What counts as a valid phone number format for validation purposes (country code, format)?** — Owner: user. Block: none (S-01 can ship with a permissive default per the PRD's own "warn, don't block" rule).

## Parked

- **AD/HR integration to auto-pull employee data** — Why parked: PRD Non-Goals — keeps MVP scope contained; all data entered manually by help desk/IT.
- **Transferring an employee record between departments** — Why parked: PRD Non-Goals — department-scoped access is the MVP's access model; transfer is deferred.
- **Confirmation/status tracking of whether the new employee ran the script** — Why parked: PRD Non-Goals — MVP flow stops at generation + email delivery.
- **Support for mail clients other than Outlook and Thunderbird (Apple Mail, Gmail web, etc.)** — Why parked: PRD Non-Goals — covers the two clients actually in use.
- **Cross-department admin role** — Why parked: PRD Non-Goals — department-scoped access is sufficient for the MVP.
- **Self-hosted Supabase migration (to fully satisfy the "data never leaves company server" guardrail)** — Why parked: `context/deployment/deploy-plan.md` explicitly defers this; current deploy uses Supabase Cloud for a fast first deployment, with IT security sign-off required before migrating.

## Milestone History

(empty — this is the first milestone)

## Done

(empty — nothing archived yet)
