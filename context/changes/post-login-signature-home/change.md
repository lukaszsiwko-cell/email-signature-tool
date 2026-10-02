---
change_id: post-login-signature-home
title: Replace the post-login starter screen with a signature workspace
status: done
created: 2026-10-02
updated: 2026-10-02
archived_at: null
---

## Scope

One view: the authenticated home page at `/`. Motif source: the existing semantic `primary` token, changed to green in `src/styles/global.css`.

## Charges

| Source | User impact |
| --- | --- |
| `src/pages/index.astro` and `src/components/Welcome.astro` | Successful sign-in returns users to a generic starter landing page rather than a useful signature-workspace entry point. |
| `src/components/Welcome.astro` | The authenticated view shows generic developer-feature icons instead of a visual tied to email signatures. |
| `src/styles/global.css`, `src/components/Topbar.astro`, and auth links | Purple primary tokens and hard-coded purple link/focus styles make navigation accents inconsistent with the requested green direction. |

## Verification

Astro check, production build, and the full smoke test pass. Browser checks covered the authenticated desktop and mobile home views, the signature preview, green link color, and zero mobile horizontal overflow. The temporary visual-test account was removed from local Supabase.