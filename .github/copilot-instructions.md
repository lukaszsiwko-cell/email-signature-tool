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

## 10xDevs AI Toolkit - Module 3, Lesson 3 (10xDevs 4.0 Hooks)

Treat a hook as a **quality gate the harness runs for the agent**, not a script you hope the agent notices. Hooks run outside the model, so they survive context compaction and forgotten instructions — but only a hook whose signal actually reaches the agent closes the loop:

```
test-plan.md "Quality Gates" -> pick the moment per gate -> /10x-configure-hook -> prove with sample JSON -> watch the agent fix a deliberate error
```

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| `/10x-configure-hook` | Turning the gates from `context/foundation/test-plan.md` into agent hooks, fixing hooks that fire but the agent never reacts to, or auditing an existing hook config. It detects the harness from the repo and carries dated per-harness references. |
| `/10x-test-plan --status` | Read the current gates and rollout state. Changing which gates exist belongs to Lesson 1, not here. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | A hook surfaced a failure the agent cannot fix with a trivial correction (wrong business logic, flaky integration). Open a change instead of looping the hook. |

### Hook lifecycle

1. **Trigger** — an event in the harness: a tool finished editing a file, the agent is about to end its turn.
2. **Matcher** — narrows which tool calls or files the hook reacts to. Not every harness honours matchers the same way.
3. **Handler** — usually a shell command or script that reads the event payload as JSON on stdin.
4. **Signal** — what the hook returns. The exit code, stderr, stdout and JSON fields mean different things in different harnesses, and only one channel per event actually reaches the agent. **The signal channel differs per harness — check the skill's references before writing or reviewing a hook.**

A hook that runs but sends its message down the wrong channel is the most common failure: the user sees "hook error", the agent sees nothing and keeps going.

### Moments and layers

The slower the check, the rarer the moment:

| Moment | Typical checks | Reaches the agent? |
| --- | --- | --- |
| Per edit | Lint/format of **the edited file only**; related tests if they are fast | Yes, mid-work |
| End of turn (Stop or its equivalent) | Lint + tests for every file changed this turn, whole-project typecheck | Yes, before the agent hands back |
| Pre-commit (git) | Lint + tests on staged files; catches edits made without the agent | No — blocks the commit |
| Pre-push (git) | Heavier suites, e2e that run locally | No — blocks the push |
| CI | Integration, shared state, infrastructure you do not have locally | No — PR feedback |

Local layers do not replace CI; each one saves a CI round-trip. Start with one per-edit lint hook and one end-of-turn typecheck, then add layers when you see what escapes.

### Contract

- Read the gates from the "Quality Gates" section of `context/foundation/test-plan.md` (by title, not section number). A gate the plan explicitly defers stays deferred unless the user overrides it — quote the deferral when you ask.
- Per-edit hooks check only the file that was edited. Never run `--fix` or a linter over the whole project on every edit.
- End-of-turn hooks that can send the agent back must stop after one retry (the harness's "already continued" flag or equivalent), so an unfixable error does not loop.
- Per-edit hooks only see the harness's edit tools; a file rewritten through a shell command skips them. The end-of-turn hook re-checks every file changed this turn (`git diff`), so it is the net for those edits.
- Timeouts are usually in **seconds**. Check the unit before copying a number.
- Prove every hook before trusting it: run the script with a sample payload on a deliberately broken file and on a clean one, then revert the error.
- Never overwrite existing hook config silently. Audit it, name the defects, merge, and show the diff.

### Lesson boundaries

- Do not change the risk strategy or the gate definitions — that is Lesson 1 (`/10x-test-plan`).
- Do not write new tests here — hooks only run the tests Lesson 2 produced.
- Do not write E2E scenarios or browser verification — that is Lesson 4.
- Do not author CI pipelines or install git-hook managers unasked; recommend pre-commit/pre-push gates, let the user decide.

<!-- END @przeprogramowani/10x-cli -->
