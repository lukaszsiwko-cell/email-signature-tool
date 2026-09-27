---
change_id: employees-view-tokens
title: Wire the employees view onto the existing shadcn token contract
status: implementing
created: 2026-09-27
updated: 2026-09-27
archived_at: null
---

## Notes

/10x-ui run. View: `src/pages/employees.astro` (+ its render tree: `Topbar.astro`,
`AddEmployeeForm.tsx`, `EmployeeTable.tsx`, `DepartmentLogoManager.tsx`). Token source:
`src/styles/global.css` (shadcn `:root`/`.dark` + `@theme inline`), components: `src/components/ui/`.

Repo already ships a full shadcn token contract and correctly-tokenized primitives
(Button/Input/Table/Label). The employees view and its feature components never read
them: every surface/border/text color is a literal Tailwind utility (`bg-white/10`,
`text-blue-100/70`, `bg-purple-600`, `focus-visible:ring-purple-400`, `text-red-300`...),
and the `.dark` token block that would supply this exact palette is dead code — nothing
ever sets `class="dark"` on `<html>`. See `research.md` for the charge list and
`DESIGN.md` for the token deltas and their sources.
