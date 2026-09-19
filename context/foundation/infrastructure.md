---
project: "Email Signature Tool"
researched_at: 2026-09-19
recommended_platform: Cloudflare Workers
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 7 (React 19 islands)
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare
---

## Recommendation

**Deploy the Astro app on Cloudflare Workers.**

Cloudflare Workers is already the tech stack's decided runtime (`@astrojs/cloudflare`, `deployment_target: cloudflare-pages` in `tech-stack.md`), scores 5/5 Pass on the agent-friendly criteria (CLI-first `wrangler`, GA `llms.txt` docs, GA deploy API, GA Hyperdrive for external Postgres, GA Agents/MCP platform), fits comfortably in the free tier at this project's low request volume, and matches the team's existing Cloudflare familiarity (interview Q3). The self-hosted Supabase database (a separate, already-decided data-layer choice per `tech-stack.md`) stays on the company's own server; this research covers the app/compute tier only. The network-boundary gap this introduces (Cloudflare Workers cannot use static/allowlistable egress IPs) is real and is carried forward explicitly in the risk register with a required mitigation (Cloudflare Tunnel or equivalent) before go-live.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Railway | Pass | Pass | Pass | Partial | Pass | 4 Pass, 1 Partial |
| Netlify | Partial | Pass | Pass | Pass | Pass | 4 Pass, 1 Partial |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4 Pass, 1 Partial |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 3 Pass, 2 Partial |
| Render | Pass | Pass | Partial | Pass | Pass | 4 Pass, 1 Partial |

- **Cloudflare Workers**: `wrangler deploy`/`wrangler tail`/`wrangler rollback` fully scriptable; `llms.txt` published for every docs section (GA); Hyperdrive (GA) is the documented path to an external Postgres/Supabase instance; free tier covers 100k req/day, well above this project's volume. The one soft spot is egress-IP allowlisting (see Risk Register).
- **Railway**: containers are always-on (no cold starts), Static Outbound IPs (GA, Pro-plan-gated at $20/mo workspace fee) give 3 fixed IPs for DB firewall allowlisting — a real improvement in network-boundary tightness over Cloudflare's dynamic ranges — but total cost lands near $30-35/mo and rollback is "redeploy an old deployment ID," not a dedicated command (Partial on Stable deploy API).
- **Netlify**: solid serverless fit for Astro SSR, official `@netlify/mcp` server, `llms.txt`-backed docs; rollback is dashboard/UI-driven only (Partial on CLI-first), and static-IP egress for DB allowlisting requires contacting an account manager (not self-serve).
- **Vercel**: mature CLI/rollback/logs, but Hobby tier is explicitly non-commercial (an internal company tool needs Pro, $20/mo), no fixed egress IP without paid/enterprise tiers, and its MCP server is still in public beta (Partial).
- **Fly.io**: full container control and GA private networking, but that private networking only connects Fly-to-Fly, not to an external company server; more manual ops (Dockerfile, health checks) for a solo dev on a 3-week timeline (Partial on Managed/Serverless); MCP integration is early/beta-maturity.
- **Render**: GA CLI, GA official MCP server, static outbound IPs available but Pro-plan-gated; no public markdown/GitHub docs source was found (Partial on Agent-readable docs), and its free tier's 15-minute idle spin-down (~60s cold start) is a poor fit even though this project would use a paid always-on plan anyway.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the locked-in runtime per `tech-stack.md`; top score on all five criteria; zero incremental cost at this traffic level; team already familiar with it. The trade-off — no allowlistable static egress IP — is addressed via a required mitigation in the Getting Started / Risk Register sections rather than by switching platforms mid-project.

#### 2. Railway

Runner-up specifically because its Static Outbound IPs feature most directly closes the network-allowlisting gap Cloudflare leaves open, at the cost of ~$30-35/mo and losing the "already decided" advantage. Kept as the concrete fallback if Cloudflare Tunnel setup proves impractical for the self-hosted Supabase firewall.

#### 3. Netlify

Third pick: comparable serverless simplicity to Cloudflare, official MCP server, but rollback is UI-only and DB-egress IP allowlisting isn't self-serve — a downgrade versus both Cloudflare (already chosen) and Railway (self-serve static IPs).

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Astro on Cloudflare runs on `workerd`, not Node.js — any dependency using native Node APIs (fs, native TCP libs) can silently break at build or runtime; Supabase JS client / `pg`-style Postgres driver compatibility with the Workers runtime needs explicit verification before build-out.
2. Cloudflare's outbound Worker IPs are not published/stable — the self-hosted Supabase server cannot cleanly IP-allowlist Cloudflare; the choice becomes broad-range allowlisting (weakens the "never leaves company server" guardrail's network-isolation intent) or auth-only (TLS + password) exposure.
3. Hyperdrive is designed/tested against internet-reachable Postgres; tunneling it to a database behind a private company network adds undocumented complexity — may effectively require exposing the DB port to the public internet with TLS+password as the only real boundary.
4. Auto Minify / hydration edge cases and the Node-compat flag are known footguns for React islands on Workers; a solo dev on a 3-week timeline debugging Workers-specific build failures burns schedule.
5. Cloudflare now positions Pages as secondary to Workers for new projects — docs/migration guidance may shift under a solo dev mid-project.

### Pre-Mortem — How This Could Fail

The team assumed Hyperdrive would transparently tunnel to their on-prem Supabase like a VPN, but it actually required opening the Postgres port to the internet (relying only on TLS + a strong password) because Cloudflare's Worker egress IPs are dynamic and can't be firewalled. IT security flagged this during an audit — the "never leaves company server" guardrail was technically true (data storage stayed put) but the transport model didn't match the audit's inherent expectation of network-level isolation, forcing an emergency re-architecture (adding a reverse-tunnel/VPN gateway) mid-flight, right before the hard October 30 deadline, while the solo dev was already stretched thin on Outlook/Thunderbird script edge cases.

### Unknown Unknowns

- Cloudflare Workers cannot hold long-lived raw TCP connections the way a traditional Node server pools them; every request potentially pays a fresh connection cost to Hyperdrive/Postgres unless pooling is configured correctly.
- The company's IT security team may have opinions on "data transiting a Cloudflare edge," even transiently, that a solo dev wouldn't think to clear before deploying.
- workerd's CPU-time-based (not wall-clock) billing/limits can behave unexpectedly if the self-hosted Supabase DB is slow or under load — the Worker can hit CPU limits waiting synchronously on a slow query in ways a Node server wouldn't.

**Decision recorded**: proceed with Cloudflare Workers, risks captured in the Risk Register below, with a required mitigation (Cloudflare Tunnel or equivalent reverse-connection) to close the network-boundary gap before the self-hosted Supabase database is connected in production.

## Operational Story

- **Preview deploys**: Workers Builds creates a preview URL per branch/PR automatically on push (via the GitHub integration); no extra config needed for a single-repo, single-branch internal tool, but preview URLs should be protected with Cloudflare Access if they ever expose real employee data during testing.
- **Secrets**: `SUPABASE_URL`/`SUPABASE_KEY` (or the Hyperdrive connection config) are stored as Worker Secrets via `wrangler secret put` (encrypted at rest, not visible in the dashboard after set) and mirrored as GitHub Actions repository secrets for the CI build step; only account admins can read/rotate them via `wrangler secret put` again (values can't be read back, only overwritten).
- **Rollback**: `wrangler rollback [deployment-id]` or the Workers Builds dashboard "Rollback" button reverts to a prior deployment in seconds; database migrations on the self-hosted Supabase do not auto-roll-back and must be reverted manually/separately.
- **Approval**: deploying to production (merge to `master` triggering auto-deploy) is agent-executable; provisioning the Hyperdrive-to-Supabase network path (opening a port, configuring a tunnel, rotating the DB password) is human-only, given the PII guardrail.
- **Logs**: `wrangler tail` streams live Worker logs read-only from the terminal; Cloudflare's dashboard Logs/Analytics view is the equivalent read-only surface for an agent without CLI access, and Hyperdrive query-level diagnostics are available via `wrangler hyperdrive` subcommands.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Cloudflare Worker egress IPs are dynamic/shared, preventing IP-based firewall allowlisting on the self-hosted Supabase server | Devil's advocate | H | H | Stand up a Cloudflare Tunnel (or WireGuard/Tailscale sidecar) from the company server so the DB never accepts public internet connections; rely on the tunnel, not IP allowlisting, as the network boundary |
| Hyperdrive assumed to tunnel privately but actually requires internet-reachable Postgres | Pre-mortem | M | H | Validate the exact Hyperdrive-to-self-hosted-DB connectivity model before build-out (spike in week 1, not week 3); confirm with IT security whether TLS+password alone satisfies the guardrail or a tunnel is mandatory |
| Node-API-incompatible dependency (e.g. a Postgres/Supabase client relying on native `net`/`tls`) breaks at build or runtime on `workerd` | Devil's advocate | M | M | Verify Supabase JS client + any driver against Cloudflare Workers compatibility docs before writing data-access code; budget a fallback to `@supabase/supabase-js` fetch-based client if native TCP drivers fail |
| Fresh/unpooled connections to Postgres on every Worker invocation degrade performance or exhaust DB connections | Unknown unknowns | M | M | Use Hyperdrive's built-in connection pooling (GA) rather than a raw `connect()`/TCP socket approach |
| Auto Minify or Node-compat-flag build issues stall the 3-week solo-dev timeline | Devil's advocate | M | M | Set the `nodejs_compat` flag and disable Auto Minify explicitly in `wrangler.toml`/dashboard early, before UI work begins |
| IT security objects to any transient PII transit through Cloudflare's edge network, post-deployment | Unknown unknowns | M | H | Get written sign-off from IT security on the Cloudflare Tunnel + Hyperdrive architecture before connecting real employee data, not after |
| workerd CPU-time limits trip on slow self-hosted DB queries under load | Unknown unknowns | L | M | Add query timeouts and indexes on the Supabase side; monitor CPU-time via `wrangler tail`/Analytics during early usage |

## Getting Started

1. Confirm the Astro config already targets the Cloudflare adapter: `npx astro add cloudflare` (if not already run) and set `output: "server"` in `astro.config.mjs`.
2. Install and authenticate Wrangler: `npm i -D wrangler` then `npx wrangler login`.
3. Provision a Hyperdrive config pointing at the self-hosted Supabase Postgres: `npx wrangler hyperdrive create email-signature-db --connection-string="postgres://..."` — do this only after the Cloudflare Tunnel (or equivalent) is in place per the risk register, not before.
4. Store secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (repeat for CI via GitHub Actions repository secrets).
5. Deploy: `npx wrangler deploy` (or let the existing GitHub Actions auto-deploy-on-merge flow trigger it); verify with `npx wrangler tail` immediately after the first production deploy.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
