# Repository Guidelines

Astro 7 SSR starter (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) deployed to Cloudflare Workers via `@astrojs/cloudflare`.

## Hard rules

- All pages render server-side (`output: "server"`); API route files under `src/pages/api/` must export `const prerender = false`.
- `SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets read via `astro:env/server` — never expose them to the client or log them.
- Route protection lives in `src/middleware.ts`'s `PROTECTED_ROUTES` array; add new protected paths there, not with per-page checks.

## Project Structure & Module Organization

- `src/pages/` — Astro pages and file-based routes; `src/pages/api/` — API endpoints.
- `src/layouts/`, `src/components/` (Astro + React, shadcn/ui in `src/components/ui/`), `src/components/hooks/` — extracted React hooks.
- `src/lib/` (`src/lib/services/` for business logic), `src/middleware.ts`, `src/types.ts` — shared entity/DTO types.
- `supabase/migrations/` — SQL migrations. `public/`, `scripts/smoke.mjs`.
- See `@README.md` for local Supabase/env setup and deployment steps.

## Build, Test, and Development Commands

- `npm run dev` — Astro dev server (Cloudflare workerd runtime).
- `npm run build` / `npm run preview` — production build / preview.
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked rules).
- `npm run format` — Prettier (astro + tailwind plugins).
- `npm run smoke` — auth-flow smoke test against `BASE_URL` (default `http://localhost:4321`); run after dependency upgrades.

## Coding Style & Naming Conventions

- Path alias `@/*` → `./src/*` (see `@tsconfig.json`).
- Astro components for static content/layout; React only where interactivity is needed. No Next.js directives (`"use client"`, etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — never concatenate class strings manually.
- Add shadcn/ui components with `npx shadcn@latest add [name]` ("new-york" variant).
- API route handlers use uppercase `GET`/`POST` exports and validate input with `zod`.
- Husky + lint-staged run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` pre-commit.

## Testing Guidelines

- No unit/integration test suite yet; `scripts/smoke.mjs` (`npm run smoke`) is the only automated check, covering sign-up/sign-in/protected-page/sign-out over HTTP against a running server.
- CI's `smoke` job runs it against a production preview with a local Supabase instance.

## Commit & Pull Request Guidelines

- No git history is available in this checkout to infer a commit-message convention — confirm with the team before assuming Conventional Commits.
- CI (`@.github/workflows/ci.yml`) gates PRs to `master` with two required jobs: `ci` (lint, `astro check`, build) and `smoke` (build + preview + `npm run smoke`).

## Security & Configuration Tips

- Copy `@.env.example` to `.env` (Node/local Supabase) and `.dev.vars` (Cloudflare local dev, gitignored) — never commit either.
- `SUPABASE_URL`/`SUPABASE_KEY` must also be set as Cloudflare/GitHub Actions secrets for build and deploy.
- Enable RLS with granular per-operation, per-role policies on every new Supabase table; migrations follow `YYYYMMDDHHmmss_short_description.sql`.
