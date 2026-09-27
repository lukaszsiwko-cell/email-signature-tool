# DESIGN.md — employees-view-tokens

Token deltas applied to `src/styles/global.css`'s existing `.dark` block (activated
via `class="dark"` on `<html>` in `Layout.astro`), so the already-correct primitives
(`Button`, `Input`, `Table`) and this view render the same "dark glass + purple accent"
look from one source instead of two.

Values sourced from Tailwind v4's own palette (`node_modules/tailwindcss/theme.css`)
to match what was already hand-picked in the view, so the visual result is unchanged
except for what the charges called out (gradient heading text, per-file drift).

| Token | Old (`.dark`) | New | Source |
| --- | --- | --- | --- |
| `--card` | `oklch(0.205 0 0)` (opaque) | `oklch(1 0 0 / 10%)` | `bg-white/10` — `employees.astro:29`, `DepartmentLogoManager.tsx` section wrapper |
| `--primary` | `oklch(0.922 0 0)` (gray) | `oklch(55.8% 0.288 302.321)` (Tailwind `purple-600`) | `bg-purple-600` — submit/save/upload buttons across all three feature components |
| `--primary-foreground` | `oklch(0.205 0 0)` | `oklch(1 0 0)` (white) | `text-white` on the same buttons |
| `--ring` | `oklch(0.556 0 0)` (gray) | `oklch(71.4% 0.203 305.504)` (Tailwind `purple-400`) | `focus-visible:ring-purple-400` — every custom `fieldClass()` |
| `--accent` | `oklch(0.269 0 0)` (opaque) | `oklch(1 0 0 / 15%)` | `hover:bg-white/20` on outline buttons |
| `--muted-foreground` | `oklch(0.708 0 0)` (neutral gray) | `oklch(70% 0.032 255.585)` (Tailwind `blue-100` hue/chroma, dimmed) | `text-blue-100/60`, `/70`, `/80` — labels, helper text, empty state |

Unchanged because they already matched (confirming C2 — nobody needed to hand-roll
these, the token was already right):

- `--border: oklch(1 0 0 / 10%)` already equals every `border-white/10`.
- `--input: oklch(1 0 0 / 15%)` already equals the `bg-white/10`/`/15` inputs.
- `--destructive: oklch(0.704 0.191 22.216)` already equals Tailwind `red-400`, the
  color hardcoded for every error string (`text-red-300`/`text-red-400`).

Not touched: `--background`, `--secondary`, `--popover*`, `--sidebar*` (not exercised
by this view); `bg-cosmic` (the page-level gradient utility) stays as its own named
utility — a gradient isn't a single semantic color and the view's outer wrapper is
allowed to set its own backdrop.
