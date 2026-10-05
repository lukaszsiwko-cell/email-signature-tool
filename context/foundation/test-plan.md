# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-05 (Phase 1: researched)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data. (For this
   guide, the Phase 2 interview was aborted after 3 skips — see §7 for the
   negative-space consequence of this gap.)
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents and
   codebase *signal* (churn, structure, test base). It does NOT claim to
   know which line owns the failure. That knowledge is produced by
   `/10x-research` during each rollout phase. If the plan and research
   disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/pages/api`,
`src/lib/services`, `src/components/employees`, `src/components/auth`,
`src/pages/auth` (24 commits / 30 days).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that
surfaced this risk* — never a specific file as "where the failure lives"
(that is research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A help-desk user reaches, edits, or deletes an employee record, department logo, or generated signature belonging to another department via a crafted request | High | High | PRD Access Control + NFR guardrail ("never view/act on another department's records, even via a crafted request"); hot-spot dirs `src/pages/api` (15 commits/30d), `src/lib/services` (14 commits/30d) |
| 2 | The one-time email download link is redeemed twice, redeemed via a plain GET, or still serves files after its 24h expiry | High | Medium | `context/changes/email-signature-scripts-to-employee/plan.md` ("Critical Implementation Details": atomic redeem-and-delete, no GET redemption); roadmap S-05 (in-progress) |
| 3 | An employee's name/position/phone containing special characters breaks HTML escaping or gets interpolated as executable PowerShell, corrupting the signature or running unintended script content | High | Medium | `context/changes/generate-signature-scripts/plan.md` ("script payload data must be encoded rather than interpolated as executable PowerShell source"); hot-spot dir `src/components/employees` (11 commits/30d) |
| 4 | A generated signature artifact embeds the department's expiring Supabase signed logo URL (or raw storage path) instead of embedded bytes, exposing storage access outside the department/server boundary | High | Medium | `context/archive/2026-09-27-set-department-logo/plan-brief.md` + `generate-signature-scripts/plan.md` ("must not include any Supabase URL"); PRD guardrail (data never leaves company server) |
| 5 | The anonymous, no-account redemption endpoint has no stated rate limiting, so its single-use token is guessable/brute-forceable before the legitimate recipient redeems it | Medium | Medium | `email-signature-scripts-to-employee/plan.md` (anonymous endpoint + security-definer SQL function); abuse lens — resource abuse / authorization |
| 6 | The email relay is unconfigured or fails silently, leaving the employee with no script and no visible error for IT — defeating the PRD's self-service goal and few-seconds-feedback NFR | Medium | Medium | `email-signature-scripts-to-employee/plan.md` ("relay endpoint and network route are not configured yet"); PRD Success Criteria + NFR |

**Impact × Likelihood rubric**

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

**Abuse / security lens applied:** the product has auth, department-scoped access control, and accepts user input (employee data, signature generation, email delivery). Risk #1 covers authorization/IDOR; Risk #3 covers untrusted input/injection; Risk #4 covers secret/PII-adjacent leakage (storage URLs); Risk #5 covers resource abuse (token brute force).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A second department's API/service call is rejected (401/404), not just hidden in the UI | "RLS exists so every route is automatically safe" | Auth boundary + RLS policy per table; which routes re-derive department scope vs. trust a client-supplied id | integration | Asserting against mocked auth that bypasses real RLS |
| #2 | GET never redeems; a second redemption attempt fails; an expired token fails | "The atomic SQL function is correct by construction" | The redeem-and-delete DB function; how the fragment token reaches the server only via explicit action | integration (real/local Supabase) | Testing only the happy-path single redemption |
| #3 | A crafted name (e.g. containing `"`, `` ` ``, `$()`) renders as inert text in both the HTML and PowerShell outputs | "Escaping one output format covers both" | The generation service's encoding path for each artifact type | unit | Testing with only alphanumeric fixture names |
| #4 | The generated artifact never contains a Supabase URL substring, regardless of logo presence | "Embedding bytes once was correct, so every future logo path is too" | Logo byte-fetch path vs. signed-URL path; what happens when no logo is configured | unit / contract on generator output | Snapshotting output without asserting the specific exclusion |
| #5 | Repeated/guessed redemption attempts are rejected and don't leak timing/existence information | "24h expiry alone is enough protection" | Token entropy/hash strategy; presence (or absence) of rate-limiting/lockout | integration | Testing only a single correct token |
| #6 | A relay failure or missing configuration surfaces a clear operator-visible error rather than a false "sent" | "The happy-path mock relay response represents production" | The relay adapter's failure/timeout handling and what the UI shows on failure | integration (mock relay forced to fail) | Only testing the success response |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Bootstrap the test runner; defend department isolation and script-injection escaping | #1, #3 | unit + integration | researched | `context/changes/testing-critical-path-coverage/` |
| 2 | Delivery-flow integration | Defend the one-time link lifecycle, logo-URL exclusion, and redemption brute-force | #2, #4, #5 | integration | not started | — |
| 3 | Quality-gates wiring | Wire the new suite into CI; defend relay-failure visibility | #6 | integration + CI gate | not started | — |

**Status vocabulary** (fixed — parser literals):

| Value | Meaning |
|---|---|
| `not started` | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched` | `research.md` exists in the change folder. |
| `planned` | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete` | Progress section is fully `[x]`. |

No AI-native phase is included — this is a low-visual-complexity CRUD app; manual client checks already recorded in `generate-signature-scripts/plan.md` cover visual rendering, and nothing here needs a vision model over a deterministic diff.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | none yet — see §3 Phase 1 | — | No test runner configured; bootstrap in Phase 1. Vitest is the natural fit (Astro's documented test recommendation, zero extra runtime config vs. the Cloudflare Workers target). |
| API mocking | none yet — see §3 Phase 1/2 | — | Mock the relay HTTP edge and, where needed, the Supabase client boundary; never mock internal service modules. |
| e2e | none planned | — | Not scoped in this rollout; `scripts/smoke.mjs` already exercises the deployed HTTP surface and is kept as-is. |
| accessibility | none planned | — | Out of scope for this rollout; no accessibility risk surfaced from PRD/roadmap. |
| (optional) AI-native | not proposed | n/a | No AI-native phase proposed (see §3 rationale) |

**Stack grounding tools (current session):**
- Docs: none available in current session (no Context7/framework-docs MCP exposed) — recommendation above is based on local manifest inspection (`package.json`, `astro.config.mjs`) only; checked: 2026-10-05
- Search: none available in current session (no Exa.ai/web-search MCP exposed); checked: 2026-10-05
- Runtime/browser: none available in current session (no Playwright/browser MCP exposed) — not used; checked: 2026-10-05
- Provider/platform: GitHub MCP available — relevant for inspecting CI workflow runs when §3 Phase 3 wires the gate; not used yet; checked: 2026-10-05

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired in `.github/workflows/ci.yml`) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions (department isolation, escaping, token lifecycle) |
| smoke (`scripts/smoke.mjs`) | CI `smoke` job | required (already wired) | deployed auth-flow and employee-flow regressions |
| post-edit hook | local (agent loop) | not proposed this rollout | — |
| visual diff (deterministic) | CI on PR | optional | rendering regressions |
| multimodal visual review | CI on PR | optional | not proposed this rollout (see §3 rationale) |
| pre-prod smoke | between merge + prod | required (already wired per CI's `smoke` job against a production preview) | environment-specific failures |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 for the script-injection/escaping pattern (Risk #3).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 for the department-isolation pattern (Risk #1).

### 6.3 Adding an e2e test

- Not in scope for this rollout; `scripts/smoke.mjs` remains the deployed-HTTP-surface check.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 for the department-scoped API endpoint pattern (Risk #1).

### 6.5 Adding a test for the one-time delivery/redemption flow

- TBD — see §3 Phase 2 (Risks #2, #4, #5).

### 6.6 Per-rollout-phase notes

(Empty — fills in as phases land.)

## 7. What We Deliberately Don't Test

- **User-stated negative space** — not available this round. The Phase 2 interview (including Q5, "what would you NOT want test budget spent on") was aborted after 3 skips. No exclusions are recorded from user input; re-run `/10x-test-plan --refresh` once the team is ready to answer the interview, or answer Q5 directly to populate this section.
- **Accessibility and e2e** — not scoped in this rollout; no risk from PRD/roadmap/hot-spots pointed at either. Re-evaluate if a future slice adds a public-facing, accessibility-sensitive surface.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-05
- AI-native tool references last verified: n/a (none proposed)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes (e.g., the Phase 2 interview is finally completed).
