---
date: 2026-09-27
researcher: Copilot CLI (/10x-ui)
topic: "Employees view — design-system audit"
status: complete
last_updated: 2026-09-27
---

# Research: Employees view design-system audit

## Research Question

Is `src/pages/employees.astro` reading this repo's existing token/component contract,
or reinventing its own?

## Summary

The repo already has both halves of the contract: semantic tokens in
`src/styles/global.css` (`:root`/`.dark`, published via `@theme inline`), and
correctly-tokenized shared primitives in `src/components/ui/` (`Button`, `Input`,
`Table`, `Label` all read `bg-primary`, `border-input`, `focus-visible:ring-ring`,
`text-destructive`, etc. with no literal colors). The employees view and every
custom component it renders bypass both, hand-rolling a "dark glass + purple accent"
look with literal Tailwind color utilities on every call site. The `.dark` token
block already encodes almost exactly this look (`--border: oklch(1 0 0 / 10%)`,
`--input: oklch(1 0 0 / 15%)`, `--destructive: oklch(0.704 0.191 22.216)` == Tailwind
`red-400`) — it's just never activated, so nobody notices it already matches.

## Charges

### C1 — Missing tokens (systemic): literal colors instead of semantic classes

- `src/pages/employees.astro:26-46` — card `border-white/10 bg-white/10`, heading
  `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text ... text-transparent`,
  error banner `border-red-500/30 bg-red-900/30 text-red-300`, empty state
  `text-blue-100/60`.
- `src/components/Topbar.astro:6-30` — `border-white/10 bg-white/5 text-white/80`,
  `text-blue-100/70`, nav links `text-purple-300 hover:text-purple-100`.
- `src/components/employees/AddEmployeeForm.tsx:26-30,113,177` — `fieldClass()`
  hardcodes `bg-white/10 ... focus-visible:ring-purple-400`, error text `text-red-300`,
  submit button `bg-purple-600 ... hover:bg-purple-500`.
- `src/components/employees/EmployeeTable.tsx:35-38` and throughout — same
  `fieldClass()`, `border-white/10`/`hover:bg-white/5` rows, `text-white` cells,
  `text-red-300` row errors, `bg-purple-600` save button, `border-white/20 bg-white/10
  text-white hover:bg-white/20` on every outline button.
- `src/components/departments/DepartmentLogoManager.tsx:17-21` and throughout — same
  pattern (`fieldClass()`, `border-white/10 bg-white/5`, `text-blue-100/70`,
  `bg-purple-600`, outline-button overrides).

**User impact**: a brand/contrast change (or a future dark/light toggle) requires
editing 5+ files by hand instead of one token file; the primitives already do the
right thing and get overridden at every call site.

### C2 — Dead `.dark` token block

- `src/styles/global.css:47-73` defines a full `.dark` palette. `src/layouts/Layout.astro`
  never adds `class="dark"` to `<html>` — the tokens are unreachable.
- The values it already defines are near-identical to what's hand-rolled elsewhere:
  `--border: oklch(1 0 0 / 10%)` ≈ every `border-white/10`; `--input: oklch(1 0 0 / 15%)`
  ≈ every `bg-white/10`/`/15`; `--destructive: oklch(0.704 0.191 22.216)` is *exactly*
  Tailwind `red-400`, the color already used for every hardcoded error string.

**User impact**: the app's actual dark-mode mechanism is dead code; the visual identity
lives outside the token layer and has already drifted (three different purple/blue/red
shades hand-picked across four files).

### C3 — Missing shared component: duplicated field styling + confirm pattern

- `fieldClass()` is copy-pasted near-identically in `AddEmployeeForm.tsx:26-30`,
  `EmployeeTable.tsx:35-38`, `DepartmentLogoManager.tsx:17-21`, manually toggling
  error border/ring colors that the `Input` primitive already supports natively via
  `aria-invalid:border-destructive aria-invalid:ring-destructive/20`
  (`src/components/ui/input.tsx:12`).
- The inline "Are you sure? Yes/No" confirm UI is reimplemented separately in
  `EmployeeTable.tsx` (delete) and `DepartmentLogoManager.tsx` (remove logo) instead
  of one shared component.

**User impact**: a focus/error-state fix has to be made three times and will drift;
error state on inputs currently ignores the primitive's own `aria-invalid` contract.

### C4 — Focus ring bypasses the `--ring` token

- `AddEmployeeForm.tsx:29`, `EmployeeTable.tsx:37`, `DepartmentLogoManager.tsx:20`
  hardcode `focus-visible:ring-purple-400`, overriding `Input`'s own
  `focus-visible:ring-ring/50` default (`src/components/ui/input.tsx:12`).

**User impact**: focus-visible color is inconsistent between any future plain-token
input and every input on this page; changing `--ring` later (e.g. for contrast) won't
reach this screen.

## Deferred (out of scope for this change)

- `src/components/Banner.astro` (site banner) hardcodes raw hex (`#dbeafe`, `#fef3c7`,
  `#fee2e2`) in a `<style>` block — same missing-tokens charge, different view; leaving
  it for a separate change to keep this one to one view + globals.
- The phone-format hint (`text-yellow-300`, e.g. `AddEmployeeForm.tsx:88`) is a genuine
  third semantic state ("warn, never block") that shadcn's default token set has no
  role for. Introducing a `--warning` token for one line isn't proportionate to this
  change; left as a literal with this note for the next time a warning state needs one.
