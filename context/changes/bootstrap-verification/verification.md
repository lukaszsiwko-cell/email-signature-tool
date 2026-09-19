---
bootstrapped_at: 2026-09-18T18:30:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: email-signature-tool
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

Email Signature Tool is a small, short-timeline (3 weeks, after-hours) web app for medium-scale internal use, with department-scoped auth (FR-001) and no payments/realtime/AI in scope — a clean fit for the recommended `(web-app, js)` default, 10x Astro Starter (Astro + Supabase + Cloudflare), which is first-class in bootstrapper and clears all four agent-friendly gates. One important caveat: the PRD's guardrail requires that employee data never leave the company's own server, and the user confirmed proceeding with the standard Cloudflare Pages + Supabase default anyway rather than a fully self-hosted stack. To honor the guardrail, the team should self-host Supabase (it is open-source and self-hostable) and self-host or tightly restrict the Cloudflare deployment, rather than using Supabase's managed cloud or Cloudflare's shared edge network as-is. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's default flow.

## Pre-scaffold verification

| Signal             | Value                                                | Severity | Notes                                                        |
| ------------------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------- |
| npm package         | not run                                                | n/a      | `cmd_template` starts with `git clone`; no npm CLI to check    |
| GitHub repo         | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh    | from card `docs_url`, via GitHub REST API                     |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: all files/directories from `.bootstrap-scaffold/` merged up into cwd (via robocopy `/E /MOVE`), including `node_modules/`
**Conflicts (.scaffold siblings)**: none — cwd had no pre-existing `package.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, or other clashing root files. The scaffold's `.github/workflows/` merged alongside cwd's existing `.github/skills/` (no path-level conflict).
**.gitignore handling**: moved silently (cwd had no `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (including its `.git/`, removed before move-up)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished — 0 findings total across 804 dependencies (377 prod, 269 dev, 167 optional)

No findings in any severity tier.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ----------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                               |
| path_taken                 | standard                            |
| self_check_answers         | null                                |
| team_size                  | solo                                |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                                |
| has_payments               | false                               |
| has_realtime               | false                               |
| has_ai                     | false                               |
| has_background_jobs        | false                               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none were created in this run).
- Address the PRD guardrail noted above: self-host Supabase and restrict/self-host the Cloudflare deployment before employee data flows through this app.
- Review the vendored `AGENTS.md`/`CLAUDE.md` from the starter for its own conventions.
