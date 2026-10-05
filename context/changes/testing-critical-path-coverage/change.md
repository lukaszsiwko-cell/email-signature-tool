---
change_id: testing-critical-path-coverage
title: Bootstrap test runner and defend department isolation + script escaping
status: implementing
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md` §3 ("Critical-path coverage").

Risks covered:
- #1 — A help-desk user reaches, edits, or deletes an employee record, department
  logo, or generated signature belonging to another department via a crafted
  request (cross-department IDOR on employees/departments/logos/signatures).
- #3 — An employee's name/position/phone containing special characters breaks
  HTML escaping or gets interpolated as executable PowerShell (HTML/PowerShell
  script-injection via unescaped employee fields).

Test types planned: unit + integration. No test runner is configured yet —
this phase bootstraps it (Vitest is the candidate per test-plan.md §4).

Risk response intent (from test-plan.md §2 Risk Response Guidance):
- #1: prove a second department's API/service call is rejected (401/404) via
  real RLS, not mocked auth. Anti-pattern to avoid: asserting against mocked
  auth that bypasses real RLS.
- #3: prove a crafted employee name/field (e.g. containing `"`, `` ` ``, `$()`)
  renders as inert text in both the HTML and PowerShell artifact outputs.
  Anti-pattern to avoid: testing with only alphanumeric fixture names.

See `context/foundation/test-plan.md` §3 (Phased Rollout), §4 (Stack), and
§6.1/§6.2/§6.4 (cookbook placeholders this phase will fill in).
