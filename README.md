# Email signature Tool

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v26.3.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/lukaszsiwko-cell/email-signature-tool.git
cd email-signature-tool
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Supabase Auth uses its built-in `auth.users` table; project migrations create the department-scoped employee and signature-delivery tables.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Cloudflare Email Service

Sending signature files uses the Cloudflare Email Service `EMAIL` binding. Email Sending is currently a beta feature on the Workers Paid plan. Onboard and verify the sender domain in Cloudflare before sending. Configure these server-only values in `.dev.vars` for local development and in the Worker environment for deployment:

| Variable | Description |
| --- | --- |
| `EMAIL_FROM` | Sender address on a domain onboarded to Cloudflare Email Service, such as `signatures@example.com`. |
| `PUBLIC_APP_URL` | Public base URL used to create recipient links; use `http://localhost:4321` locally and the deployed HTTPS origin in production. |

The binding is declared in `wrangler.jsonc`. By default, local development simulates sending and logs the message without delivering it. To send real messages locally, configure the binding with `"remote": true`; this requires Cloudflare authentication and sends to real recipients. The email contains a one-time download link, not the generated signature files. When the sender address or public URL is missing, the send action returns an error and does not create a usable link.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/). See `context/deployment/deploy-plan.md` for the full step-by-step audit trail (account setup, secrets, verification).

### Manual deploy

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, `EMAIL_FROM`, and `PUBLIC_APP_URL` in the Worker environment. Configure `EMAIL_FROM` and `PUBLIC_APP_URL` as variables; keep the Supabase credentials in the secret store.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

### Automatic deploy on push to `master`

This project uses **Cloudflare Workers Builds' native Git integration** for auto-deploy — configured once in the Cloudflare dashboard (Workers & Pages → this Worker → Settings → Build → Connect to Git), not GitHub Actions. GitHub Actions (`.github/workflows/ci.yml`) only runs lint/`astro check`/build/smoke and does not deploy.

All four values must additionally be configured in the Cloudflare dashboard (Settings → Variables and Secrets) for the Production environment — these are separate from Wrangler CLI values and GitHub Actions secrets. `SUPABASE_URL` and `SUPABASE_KEY` are **Secrets**; `EMAIL_FROM` and `PUBLIC_APP_URL` are regular variables. The `EMAIL` binding is configured by `wrangler.jsonc`.

### Post-deploy one-off: backfilling `profiles` for pre-existing accounts

The department-scoped data model (`profiles.department_id`) was added after this project's first deployment. Accounts that signed up before that migration have no `profiles` row and won't be able to use department-scoped features (employee list, etc.) until one is created for them. Run this once against production data, picking the correct department per user before running it:

```sql
insert into public.profiles (id, department_id)
select id, (select id from public.departments where name = 'IT') -- adjust per user before running in production
from auth.users
where id not in (select id from public.profiles);
```

This is a manual, one-off remediation step (per the interview decision) — there is no in-app UI for it.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP, plus the add/list-employee flow and cross-department data isolation (a second department's account must never see the first department's employees). Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.

## License

MIT
