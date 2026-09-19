---
starter_id: 10x-astro-starter
package_manager: npm
project_name: email-signature-tool
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Email Signature Tool is a small, short-timeline (3 weeks, after-hours) web app for medium-scale internal use, with department-scoped auth (FR-001) and no payments/realtime/AI in scope — a clean fit for the recommended `(web-app, js)` default, 10x Astro Starter (Astro + Supabase + Cloudflare), which is first-class in bootstrapper and clears all four agent-friendly gates. One important caveat: the PRD's guardrail requires that employee data never leave the company's own server, and the user confirmed proceeding with the standard Cloudflare Pages + Supabase default anyway rather than a fully self-hosted stack. To honor the guardrail, the team should self-host Supabase (it is open-source and self-hostable) and self-host or tightly restrict the Cloudflare deployment, rather than using Supabase's managed cloud or Cloudflare's shared edge network as-is. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's default flow.
