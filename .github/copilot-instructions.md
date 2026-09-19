# Copilot Instructions for 10xDevs CLI Skills Repository

## Overview

This repository contains AI assistant helper skills for the 10xDevs course platform (@przeprogramowani/10x-cli). These skills are packaged instruction sets that guide learners through structured project delivery exercises using various AI tools (Claude Code, Cursor, GitHub Copilot, etc.).

**Repository Structure:**
- `.agents/skills/` — AI tool-specific skill bundles (SKILL.md + references)
  - `10x-cli-setup/` — CLI installation, authentication, and onboarding workflow
  - `10x-cli-guide/` — Course content delivery, lesson navigation, and skill management
- `skills-lock.json` — Locks installed skill versions and checksums for reproducibility

## Key Concepts

### Skill Definition Format

Each skill directory contains:
- **SKILL.md** — Main instruction file with frontmatter (name, description) and detailed workflow steps
- **references/** — Supporting reference files that SKILL.md may link to (e.g., `compatibility.md`)
- Frontmatter fields (`---` delimited):
  - `name` — Canonical skill identifier (kebab-case, e.g., `10x-cli-setup`)
  - `description` — One-line summary of the skill's scope and purpose

### Multi-Profile Delivery

Skills are deployed to different AI tool profiles with standardized directory mappings:

| Profile | Tool Directory | Final Instruction File |
|---------|---|---|
| claude-code | `.claude/` | `CLAUDE.md` |
| cursor | `.cursor/` | `.cursor/rules/10x-course.mdc` |
| copilot | `.github/` | `.github/copilot-instructions.md` |
| codex | `.agents/` | `AGENTS.md` |
| devin-desktop | `.devin/` | `AGENTS.md` |
| gemini | `.gemini/` | `GEMINI.md` |
| generic | `.ai/` | `AGENTS.md` |

The skill system does **not** translate between profiles automatically — each profile reads and maintains its own separate copy of course content.

### Skill Versioning and Integrity

- Skills are referenced by lesson/module (e.g., `m1l1` = Module 1, Lesson 1)
- Each skill can be downloaded individually using filtered `get` commands: `10x_cli get m1l1 --type skills --name SKILL_NAME`
- File integrity is verified via SHA-256 hashes stored in `.10x-cli-manifest.json` and `skills-lock.json`
- Multiple independent channels deliver skills:
  1. **CLI-owned route** — Authenticated `10x_cli get` with course binding (requires 10x-cli ≥1.21.0)
  2. **Public helper route** — On-demand installation at a pinned source SHA before auth is required

**Critical:** A successful CLI install does not automatically activate skills in agent prompts. Skills must be materialized (files physically present) and their exact local paths provided to agents.

## Common Workflows

### Reading and Understanding a Skill

1. Read the SKILL.md frontmatter to understand scope
2. Follow the numbered sections in sequence
3. Look up referenced files in `references/` for detailed context (schemas, examples, dates, etc.)
4. Check `.10x-cli-manifest.json` for:
   - Lesson binding (`lessons.<LESSON_ID>.skills`)
   - File hash verification (`files.skills`)

Do not assume a skill is complete based on SKILL.md alone — cross-reference all paths listed in `test -s` checks and in the skill's prose.

### Validating Skill Downloads

After a `10x_cli get` command completes:

1. **Inspect the dry-run report** before writing any files — check the report's resource count
2. **Verify file presence** using the test checks from the skill's "Download" section
3. **Check manifest entries** — confirm lesson/skill names and file hashes in `.10x-cli-manifest.json`
4. **Verify course binding** — `.10x-cli.json` must list the correct course
5. Do not assume success from exit code 0 alone — read all report outcomes

### Managing Skill Conflicts

When a `10x_cli sync` encounters a conflicting local edit:

1. Back up local work outside the skill directory
2. Inspect the diff in the sync report
3. **Never run `--force`** automatically — it can overwrite user edits
4. For one conflicting skill, retry the filtered `get` with the same course/tool/language flags
5. Preserve the user's manual resolution choice
6. Do not manually sweep a skill directory after sync — cleanup is managed by the CLI

### Updating Skills

Three independent update mechanisms:

1. **CLI executable update** — Changes the `10x_cli` runner version (npm, binary, or standalone)
2. **Public helper update** — Repeat the pinned public `skills add` at a new intentional SHA
3. **CLI content sync** — `10x_cli sync` updates all CLI-owned course content at once

Each is separate. Updating the executable does not update installed skills. Updating skills does not update the executable.

## Authentication & Course Access

### Session Management

- **Login channels:** Email magic link (default) or Circle message (`--method circle`)
- **Non-interactive mode:** Provide `--email` and explicitly choose `--method circle`
- **Session refresh:** Transparent; re-login needed only if refresh fails
- **Never** print `auth.json`, tokens, or magic-link URLs

### Verifying Course Access

Run these commands in order to distinguish failure types:

```bash
10x_cli auth --status                           # Session validity
10x_cli list --course 10xdevs4                  # Course membership and access
10x_cli doctor --json                           # Full readiness check (read data.overall and data.checks)
```

Distinguish between:
- No course membership
- Unpublished course or locked module
- Network/API failure
- Missing `access_checked` status (valid session ≠ granted access)

Reinstalling the CLI or changing `--tool` does **not** grant course access.

## Working with Course Content

### Lesson Scope: Module 1, Lesson 1 (m1l1)

The launch exercise follows m1l1 "Od pomysłu do PRD" (From Idea to PRD) using the 10xCards example.

**Four mandatory skills in order:**
1. `10x-idea-check` — Optional to run, but files should be available during lesson prep
2. `10x-init` — Project initialization
3. `10x-shape` — Problem shaping and discovery
4. `10x-prd` — Product requirements document generation

**Cross-skill dependencies:**
- `10x-prd/SKILL.md` resolves `../10x-shape/references/prd-schema.md` — the shape skill must be installed
- `context/foundation/shape-notes.md` feeds into `10x-prd` — shape must complete before PRD
- `.claude/.10x-cli-manifest.json` tracks all four names; partial downloads do not establish a complete lesson release

### Lesson Content Inspection

After downloading a skill:

1. Read all SKILL.md references and linked files (do not assume one file is sufficient)
2. Inspect manifest file hashes against the actual installed files
3. Check for create-if-absent directories: `context/changes`, `context/archive`, `context/foundation`
4. Preserve existing user files — the skill system merges, not overwrites
5. Verify `shape-notes.md` exists and contains learner input before running PRD

### Profile and Tool Rules

Each profile has a tool-specific rule file. **Do not mix rule files** — using Claude's `CLAUDE.md` with Copilot tools will not work. Each profile reads only its own installed rules:

- Copilot (GitHub Copilot) reads `.github/copilot-instructions.md`
- The separate existence of `.claude/CLAUDE.md` or `.cursor/rules/` does not affect Copilot operations

## Important Constraints

### What NOT to Do

- **Do not delete manifests to force access** — preserve corrupt/conflicting bindings for diagnosis
- **Do not create dummy tool directories** — a missing `.claude/` or `.github/` before first download is expected
- **Do not use `--force` during sync** — it can silently overwrite user skill edits
- **Do not assume a successful exit code means all checks passed** — read doctor's `data.overall` and `data.checks` separately
- **Do not silently fall back to v3** — if v4 content is locked, preserve the error and confirm course membership
- **Do not invent product requirements** — if learner inputs are missing, ask for them; do not provide a ready-made plan
- **Do not assume native slash-command discovery** — provide explicit local file paths to agents

### Platform-Specific Notes

- **macOS/zsh** — Guided acceptance context; translate bash syntax to user's actual shell on Windows/PowerShell
- **Windows users** — Use `%APPDATA%` for config base, not `$XDG_CONFIG_HOME`; respect Windows-style paths
- **Network offline mode** — Inspect available local version/help; do not claim setup is complete from offline checks alone

## Diagnostic Checklist

| Issue | Diagnosis |
|-------|-----------|
| Auth expired/missing | `10x_cli auth --status` + `10x_cli list --course <COURSE>` |
| Email not received | Offer `10x_cli auth --method circle` (do not auto-resend) |
| Denied course access | Confirm course/membership; reinstalling CLI does not grant access |
| Locked or unpublished v4 | Inspect `10x_cli list m1 --course 10xdevs4`; preserve error; do not bypass gate |
| Missing `10x-idea-check` | Check manifest and actual files; read that skill's SKILL.md before reinstalling |
| Unsupported get syntax | Verify exact CLI version (≥1.21.0 required for `get m1l1 --type skills --name NAME`) |
| File conflict | Back up work, inspect diff, retry filtered `get` with same flags, preserve user's choice |
| Permission/write failure | Preserve specific paths and errors; no broad chmod/reset; diagnose actual cause |

## Environment Context to Carry Forward

When handing work between agents or tools, preserve this context:

```
Project: [absolute cwd path]
Course/tool/language: [e.g., 10xdevs4 / claude-code / pl]
CLI runner: [exact executable or npx command; observed version]
Auth status: [valid / login required / unknown]
Course access: [access_checked / denied / unknown]
Setup helper: [materialized path and owner]
Guide helper: [materialized path and owner]
Readiness: [specific blockers or "ready to proceed"]
```

Do not claim setup is complete if there are remaining auth, access, API, binding, or write-permission failures.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 5

Pick a deployment platform and ship to production with the **infra chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

The full Module 1 chain ships from Lessons 1–4 (re-included so you can fix any earlier contract mid-flight). `/10x-infra-research` is the lesson's main topic; the deploy step itself uses the host's built-in **Plan Mode** rather than a dedicated skill — the artifact (`context/deployment/deploy-plan.md`) is what carries forward.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Infrastructure (lesson focus)** | |
| `/10x-infra-research [path-to-tech-stack-or-prd]` | You have a `context/foundation/tech-stack.md` (and ideally a `prd.md`) and need to pick an MVP deployment platform. The skill loads the stack as a hard constraint, runs a 5-question developer interview (persistent connections, cost sensitivity, existing familiarity, global reach, co-location preference), spawns parallel subagent research across six candidate platforms, scores them Pass/Partial/Fail across the five agent-friendly criteria from `references/agent-friendly-criteria.md`, shortlists the top three, and runs a three-lens anti-bias cross-check on the leader (devil's advocate, pre-mortem, unknown unknowns) before writing `context/foundation/infrastructure.md`. Use AFTER `/10x-tech-stack-selector`, BEFORE `/10x-implement`. |
| **Deploy (host built-in, not a skill)** | |
| Plan Mode deploy | You have `infrastructure.md` + `tech-stack.md` and want a read-only plan reviewed before any mutation hits the platform. Activate your AI coding assistant's plan mode (for example, a terminal-based assistant may use a mode switch, while an IDE may provide a dedicated button) with the prompt "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Read the plan, demand corrections, approve, then let the agent execute. The approved plan persists at `context/deployment/deploy-plan.md` so the next lesson's milestone planning can reference what's already deployed and which secrets are already wired. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can patch any earlier contract mid-flight. If the anti-bias cross-check forces a platform swap that pushes a stack-shaped decision (e.g. "this DB doesn't fit any platform we'd accept"), re-run `/10x-tech-stack-selector` to keep `tech-stack.md` and `infrastructure.md` aligned. |

### How the chain hands off

- `/10x-infra-research` reads `context/foundation/tech-stack.md` (language, framework, runtime, database) as **hard constraints** — platforms that can't run the stack are dropped before scoring. It also reads `context/foundation/prd.md` (scale, latency, uptime expectations) as **soft weights** when scoring. Both inputs are optional but strongly recommended; without them the skill proceeds but warns.
- The skill writes `context/foundation/infrastructure.md` as the third foundation contract: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus a body covering recommendation, full platform comparison with scoring matrix, anti-bias findings, operational story (preview / secrets / rollback / approval / logs), and a risk register tying every entry back to the lens that surfaced it. On collision the skill prompts: overwrite, save as `infrastructure-v2.md`, or abort.
- Plan Mode reads `infrastructure.md` and `tech-stack.md` together. The agent emits a step-by-step plan covering automated steps it owns, manual setup gates (account creation, secret configuration), exact deploy commands (Pages vs Workers commands are NOT interchangeable on Cloudflare — the plan must specify), and verification steps. The plan is rejected/edited until it's right; only then does Plan Mode exit and execution begin. The approved plan lands at `context/deployment/deploy-plan.md` and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

### What the lesson's skills capture (and what they do NOT)

- **`/10x-infra-research` captures**: platform shortlist scored against five agent-friendly criteria (CLI quality, managed/serverless degree, agent-readable docs, stable/scriptable deploy API, MCP or first-class agent integration), three anti-bias outputs on the leader (numbered weaknesses, 150–200-word failure narrative, 3–5 unknown-unknowns), an operational story with one concrete answer per axis (not categories), and a risk register where every row names its source lens (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status of every non-GA feature is captured inline (`beta` / `preview` / `region-limited` / `deprecated`) with the date the status was checked.
- **`/10x-infra-research` does NOT** build Docker images or write Dockerfiles, configure CI/CD pipelines, or plan beyond MVP scope (multi-region HA is explicitly out of scope). It does NOT decide for you — the user accepts, swaps to runner-up, or aborts after the cross-check, and that decision is recorded in the output.
- **Plan Mode** captures: an explicit human gate between "agent has a plan" and "agent mutates production". The artifact (`deploy-plan.md`) is the audit trail for "what was supposed to happen" when the live run goes sideways. Plan Mode does NOT replace `/10x-infra-research` (the platform decision must already be made — Plan Mode plans the deploy, it doesn't pick where to deploy).

### The five agent-friendly criteria (and why they're load-bearing)

The criteria that make `/10x-infra-research`'s scoring matrix are not generic "good platform" axes — they're the specific traits that determine whether an agent can operate this platform from a session without you holding its hand:

1. **CLI-first** — every routine operation has a documented command; the agent doesn't need to click in a panel.
2. **Managed / serverless** — fewer moving pieces means fewer ways the agent (or you) breaks something the platform was supposed to handle.
3. **Agent-readable docs** — markdown / `llms.txt` / GitHub-hosted docs the agent can fetch and parse, not JS-rendered marketing pages.
4. **Stable, scriptable deploy API** — predictable exit codes, structured output, no interactive prompts mid-deploy.
5. **MCP server or first-class agent integration** — bonus, not required. CLI alone is fine for MVP; MCP earns its keep when the agent makes dozens of structured queries against live state.

Hard filters apply before scoring (persistent-connection requirement drops Netlify/Vercel serverless-only; tech-stack runtime mismatch drops the platform entirely). Interview answers reweight criteria after — cost sensitivity penalizes expensive base tiers, familiarity breaks ties, global-reach preference favours edge-native platforms, co-location preference favours integrated databases.

### Anti-bias as a decision discipline (not theatre)

Every research conversation with an LLM has a built-in tilt toward whatever the user already signalled. `/10x-infra-research` runs three structured lenses against the leader BEFORE the file is written, not after:

- **Devil's advocate** — *find the weaknesses, hidden costs, and failure modes specific to deploying `<this stack>` on `<this platform>`*. Output is a numbered list of 3–5 specifics, not categories.
- **Pre-mortem** — *six months later, this decision turned out to be a complete disaster; walk through the assumptions and underestimated risks that led there*. Output is a 150–200-word narrative; narratives surface concrete failure shapes that abstract risk lists hide.
- **Unknown unknowns** — *what's true about this combination that the marketing page and docs don't make obvious?* Output is 3–5 non-obvious risks.

After the cross-check the user has three real options: **proceed with the leader and absorb the risks into the register**, **swap to runner-up** (and re-run the cross-check on the new leader), or **swap to third place**. The third option is rare; if it never happens across many runs, the cross-check has degraded into a ritual and should be rewritten.

Two additional techniques (no skill required, raw prompts) belong in the same toolbox: forcing the model to compare three alternatives in a markdown table (structure beats "the same answer in different words"), and role-rotation (the same decision through a frontend dev's, security person's, and cost owner's eyes — surface the cost each role pays and propose alternatives if any of them flinch).

### CLI vs MCP for live-infra operability

After deploy, the agent needs a way to talk to the running platform. Two paths, complementary not competing:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — explicit and auditable, output stays in the terminal, safer defaults for irreversible actions (e.g. `netlify deploy` is draft by default; `--prod` must be passed). Best for MVP: minimal setup, low context cost (no tool schemas pre-loaded), and the agent has to know the command (which is where a per-tool skill helps).
- **MCP** — a dedicated server exposing structured tools with schemas (`pages_deployments_list`, etc.). Each connected MCP server adds tool definitions to the context window, so cost compounds across servers. Earns its keep when the agent makes many discovery-style queries against live state (logs, deployment diffs) and structured JSON beats parsing CLI output.

Sensible default: start with CLI, add MCP when you notice a recurring pattern of `--help` traversal the agent has to do to answer a class of questions. Anthropic's own [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) framing is "API, CLI, and MCP are three complementary paths" — pick by task, not by hype.

### Production-access boundary (minimal permissions, human-on-irreversibles)

Both CLI and MCP can give the agent direct access to production. The lesson sets a default posture:

- **Tokens are scoped, not master keys.** On Cloudflare: an API token limited to Pages or Workers for one project, no DNS, no Workers Secrets for unrelated projects, no billing. AWS / GCP equivalent: scoped IAM role with `console-only-user` or read-only on production, full access on staging.
- **Tokens live in env vars, not in `.mcp.json` committed to the repo.** The agent picks them up via the MCP server or CLI's env-discovery, not via plaintext in conversation.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a project — those are panel-by-hand operations, even if the agent suggests them. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.

This is the MVP posture. As the project matures, the natural evolution is staging gets full agent access, production becomes read-only — covered in later modules.

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` — recurring rules & pitfalls (use `/10x-lesson` from Lesson 4 if you spot a class of agent failure during research or deploy)
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The candidate platform list (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) is the starting research lens, not a recommendation set — the scoring + interview + cross-check pipeline is what's load-bearing, and a platform absent from the default list can be added by extending the research step. The five agent-friendly criteria are the artifact's true core; `/10x-infra-research` re-reads them from `references/agent-friendly-criteria.md` so they evolve as platforms do.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
