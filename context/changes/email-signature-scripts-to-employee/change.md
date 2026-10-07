---
change_id: email-signature-scripts-to-employee
title: Email signature scripts to the new employee
status: implementing
created: 2026-10-02
updated: 2026-10-07
archived_at: null
---

## Notes

Implement roadmap slice S-05: optionally email a one-time signature download link through Gmail SMTP when an employee address is available; preserve manual downloads, department isolation, and the employee-data privacy guardrail.

Decision update (2026-10-07): use Gmail SMTP over implicit TLS on port 465 instead of a company-managed HTTPS relay. Cloudflare Workers supports outbound HTTPS and Node TCP/TLS compatibility; the SMTP transport still requires live verification from the Worker runtime. Keep credentials server-only and never attach generated artifacts.
