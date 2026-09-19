---
project: "Email Signature Tool"
based_on:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
platform: Cloudflare Workers
deploy_trigger: "Cloudflare Workers Builds (native Git integration) — NOT GitHub Actions"
supabase_target: "Supabase Cloud (first deploy) — self-hosted + Hyperdrive + Tunnel deferred, see Risk Carry-Forward"
status: planned
---

# Deploy Plan — First Production Deployment

This is the audit trail for the first production deployment, per `context/foundation/infrastructure.md`'s recommendation (Cloudflare Workers) and `context/foundation/tech-stack.md`'s locked-in stack (Astro 7 + `@astrojs/cloudflare` adapter). It separates what the agent can execute directly from what requires a human, in the order they must happen.

## Scope decision (confirmed with user)

- **Deploy trigger**: Cloudflare Workers Builds' native Git integration (configured once in the Cloudflare dashboard) handles auto-deploy on every push to `master`. This is **not** a GitHub Actions job — `.github/workflows/ci.yml` is untouched and continues to run lint/`astro check`/build/smoke only. Deploy is entirely Cloudflare-managed infrastructure, separate from GitHub Actions.
- **Supabase for this first deploy**: hosted **Supabase Cloud** project, not the self-hosted instance `infrastructure.md` ultimately recommends. This unblocks a fast first deploy; the self-hosted + Hyperdrive + Cloudflare Tunnel path (and its associated risk register in `infrastructure.md`) is deferred until the project actually migrates off Supabase Cloud — see [Risk Carry-Forward](#risk-carry-forward) below.

## Pre-flight config check (already verified, no changes needed)

- `astro.config.mjs`: `output: "server"`, `adapter: cloudflare()` already set; `SUPABASE_URL`/`SUPABASE_KEY` declared as `context: "server", access: "secret"` in the env schema (never exposed client-side).
- `wrangler.jsonc`: `compatibility_flags: ["nodejs_compat"]` already set (required for the Supabase JS client on `workerd`); `assets.directory: "./dist"` matches Astro's build output; `observability.enabled: true` for logs.
- `package.json`: `wrangler` already a devDependency (`^4.131.1`) — no install needed.

No code changes are required before deploying; this plan is purely operational.

## Prerequisites — configuring the CLIs (do this before Step 1)

### A. Local environment

1. Use the pinned Node version: `nvm use` (or install Node **v22.14.0** per `.nvmrc` manually).
2. Install project dependencies (also installs Wrangler and the Supabase CLI as devDependencies — no global installs needed): `npm install`.
3. Verify the versions Wrangler/Supabase CLI resolve to:
   ```bash
   npx wrangler --version
   npx supabase --version
   ```

### B. Wrangler (Cloudflare) CLI setup

1. Authenticate once per machine: `npx wrangler login`. This opens a browser OAuth flow and stores a token under your OS user profile (`~/.wrangler/config` / `%USERPROFILE%\.wrangler\config` on Windows) — do this interactively as a human, never from an unattended/CI context.
2. Confirm the login and the account Wrangler will deploy to: `npx wrangler whoami`. If you belong to multiple Cloudflare accounts, note the **Account ID** shown — `wrangler.jsonc` currently has no `account_id` set, so Wrangler infers it from your login; if it ever resolves the wrong account, add `"account_id": "<id>"` to `wrangler.jsonc` explicitly.
3. Sanity-check the project's Wrangler config resolves without errors: `npx wrangler deploy --dry-run` (builds and validates the Worker bundle against `wrangler.jsonc` without publishing anything).
4. Only after login is confirmed, proceed to the real `npx wrangler deploy` in Step 1.

### C. Supabase CLI setup

The Supabase CLI is only strictly required for **local development** (`npx supabase start`, per `README.md`'s "First-time setup" section) or for later **linking a project for migrations**. For this deploy's chosen path (Supabase Cloud, auth-only, no custom tables/migrations), the CLI is optional — but set it up anyway so it's ready when migrations are eventually needed:

1. Log in: `npx supabase login` (opens a browser flow, stores a token under your OS user config dir — same "human, not CI" caveat as Wrangler).
2. After creating the Supabase Cloud project (Step 2 below), link this repo to it so future `supabase db` / migration commands target the right project:
   ```bash
   npx supabase link --project-ref <project-ref-from-dashboard-url>
   ```
3. Confirm the link: `npx supabase projects list` should show this project, and `npx supabase status` (when a local stack isn't running) should reference the linked remote project.
4. This step does **not** create any database tables or migrations — this project currently only uses Supabase Auth's built-in `auth.users` table (per `README.md`), so there's nothing to push yet.

## Step 1 — Human-only: Cloudflare account + first local deploy

**Status: ✅ Done** (2026-09-19). Deployed to `https://email-signature-tool.lukaszsiwko.workers.dev` (renamed from the initial `10x-astro-starter`; old Worker deleted via `wrangler delete --name 10x-astro-starter`), verified with `curl -I` → `HTTP/1.1 200 OK`. Wrangler auto-provisioned a `SESSION` KV namespace binding during deploy. Auth pages will error until Supabase secrets are set (Steps 2–3) — expected at this point.

1. Create a Cloudflare account (none exists yet) at https://dash.cloudflare.com/sign-up.
2. Authenticate Wrangler locally: `npx wrangler login` (opens a browser OAuth flow; do this on a human's machine, not in an automated context).
3. **Register a `workers.dev` subdomain** (one-time, per account) — required before the first `wrangler deploy` publishes anything; discovered during this deploy attempt (`wrangler deploy` fails with "You need to register a workers.dev subdomain before publishing to workers.dev" and can't prompt interactively in a non-interactive shell). The dashboard onboarding URL Wrangler prints (`/workers/onboarding`) 404'd for this account — **register the subdomain by running `npx wrangler deploy` yourself in a real interactive terminal** and answering "y"/entering a subdomain name when prompted; that registered it and deployed in one step.
4. Do a first manual build + deploy to validate the pipeline end-to-end:
   ```bash
   npm run build
   npx wrangler deploy
   ```
5. Confirm the deployment succeeded — Wrangler prints a `*.workers.dev` URL. Visit it to confirm the app loads (auth pages will error until Supabase secrets are set — that's expected at this point).

## Step 2 — Human-only: Supabase Cloud project

1. Create a new project at https://supabase.com/dashboard (or reuse an existing one, if already created for this app).
2. From **Settings → API**, copy the **Project URL** and the **`anon` public key**.
3. Disable "Confirm email" under **Authentication → Email** for now if you want users to sign in immediately post-signup (matches the local-dev default described in `README.md`); re-enable before real usage if desired.

## Step 3 — Human-only: set secrets for the Worker

**Status: ✅ 3a done** (2026-09-19). Both secrets set via `wrangler secret put` and confirmed via `wrangler secret list` → `SUPABASE_KEY`, `SUPABASE_URL` (both `secret_text`), applied immediately to the live Worker without a redeploy. Re-applied after the Worker rename (secrets don't carry over across a name change — a renamed Worker is a distinct resource). **3b (dashboard variables) still pending** — deferred to Step 4, since the Workers Builds environment doesn't exist until the Git integration is connected.

Two separate places need these values — they do **not** share storage:

**a) Wrangler CLI secrets** (used by the manually-deployed Worker from Step 1):
```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```
Values can't be read back afterward, only overwritten with the same commands.

**b) Cloudflare dashboard variables** (used by Workers Builds' own deploys, see Step 4 — Workers Builds does not read Wrangler CLI secrets or GitHub Actions secrets):
- Dashboard → Workers & Pages → (this project) → **Settings → Variables and Secrets** → add `SUPABASE_URL` and `SUPABASE_KEY` as **Secret** type (encrypted, not plaintext env vars).

## Step 4 — Human-only: connect Cloudflare Workers Builds for auto-deploy-on-push

1. Dashboard → Workers & Pages → this Worker → **Settings → Build → Connect to Git** (or **Create → Connect to Git** if setting up fresh).
2. Authorize Cloudflare's GitHub App for this repository, select the repo, and set the **production branch** to `master`.
3. Set the **build command** to `npm run build` and the **deploy command** to `npx wrangler deploy` (or accept Cloudflare's auto-detected Astro/Workers build settings — verify they match).
4. Confirm the Secret-type variables from Step 3b are attached to the **Production** environment (Workers Builds environments are separate from what `wrangler secret put` sets locally).
5. Save. From this point on, every push to `master` triggers a Cloudflare-managed build + deploy automatically — no GitHub Actions involvement.

## Step 5 — Verification (agent or human, after Steps 1–4 are complete)

1. Confirm the Worker responds: `curl -I https://<your-worker>.workers.dev/` → expect `200`.
2. Tail live logs during a manual smoke pass: `npx wrangler tail`.
3. Confirm secrets are present (names only, values are never printed): `npx wrangler secret list`.
4. Run the auth-flow smoke test against the deployed URL:
   ```bash
   BASE_URL=https://<your-worker>.workers.dev npm run smoke
   ```
5. Push a trivial commit to `master` and confirm in the Cloudflare dashboard (Workers & Pages → Deployments) that a new build was triggered automatically by Workers Builds — this is the check that auto-deploy-on-push is actually wired, not just configured.
6. Rollback check (optional but recommended once): trigger `wrangler rollback [deployment-id]` or use the dashboard "Rollback" button on a non-critical deployment to confirm the rollback path works before relying on it in an incident.

## Risk Carry-Forward

`infrastructure.md`'s risk register (egress-IP allowlisting, Hyperdrive-to-self-hosted-Postgres tunneling, Cloudflare Tunnel requirement, IT security sign-off) applies **only** when the project moves off Supabase Cloud onto a self-hosted Supabase instance, per the PRD's "employee data never leaves the company server" guardrail. That migration is **not** part of this deploy and must not be assumed done. Before that migration happens:

| Risk (from infrastructure.md) | Status for this deploy |
|---|---|
| Cloudflare Worker egress IPs can't be firewall-allowlisted on a self-hosted DB | N/A — Supabase Cloud is used, no self-hosted DB to allowlist yet |
| Hyperdrive-to-self-hosted-Postgres tunneling complexity | N/A — no Hyperdrive config provisioned in this deploy |
| IT security sign-off on Cloudflare edge PII transit | **Still required before any self-hosted DB migration** — do not connect real employee data to a self-hosted Supabase behind Cloudflare Workers without this sign-off |
| `nodejs_compat` / Node-API-incompatible dependency breakage | Already mitigated — flag is set in `wrangler.jsonc`, and this deploy plan's Step 5 smoke test will catch it if the Supabase client breaks on `workerd` |

**Action item for later**: when self-hosted Supabase is adopted, re-run `infrastructure.md`'s "Getting Started" steps 3–4 (Hyperdrive provisioning gated behind a Cloudflare Tunnel) before connecting production traffic, and update this file (or supersede it with a new deploy plan) to reflect the new secrets and connection path.

## Out of scope (unchanged from infrastructure.md)

- Docker image configuration
- Multi-region/HA/DR architecture
- GitHub Actions-based deploy automation (explicitly rejected in favor of Cloudflare Workers Builds for this project)
