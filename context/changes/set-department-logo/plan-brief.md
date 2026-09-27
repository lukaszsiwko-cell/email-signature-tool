# Set and Update Department Signature Logo — Plan Brief

> Full plan: `context/changes/set-department-logo/plan.md`

## What & Why

Implements FR-008: a user can set, replace, or remove the logo/graphic used across all signatures generated for their own department. First use of Supabase Storage in this repo — introduces a new isolation boundary (Storage RLS) alongside the existing table-level RLS pattern proven on `employees`.

## Starting Point

`departments.logo_url` (text, nullable) already exists from F-01 but nothing writes to it. No Storage bucket exists anywhere in `supabase/migrations/`. `src/lib/services/` has `employees.ts` only. `/employees` (`src/pages/employees.astro`) is the one department-scoped page in the app.

## Desired End State

On `/employees`, a signed-in user sees their department's current logo (or a placeholder) at the top of the page, can upload a new PNG/JPG/SVG (max 2MB) to replace it, and can remove it. Only members of the caller's own department can view, replace, or remove that department's logo — enforced by RLS on `storage.objects`, mirroring `employees`' isolation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| UI placement | New section at top of `/employees` | Keeps the one department-scoped page as the single place to manage department data, no new route |
| File types / size | PNG, JPG, **and SVG**, max 2MB | User explicitly asked for SVG support in addition to the recommended PNG/JPG-only, deferring the "can a signature script actually use it" question to S-04 |
| Replace behavior | Overwrite in place | Simpler mental model than versioning; matches "one logo per department" from FR-008 |
| Preview UX | Thumbnail preview | Immediate visual confirmation of what's set, low implementation cost |
| Remove capability | Allowed, with inline confirm | Matches the delete-confirm UX pattern already shipped in S-02's `EmployeeTable.tsx` |
| Storage bucket creation | SQL migration, not `config.toml` | `config.toml`'s `[storage.buckets.*]` only affects local dev, not Supabase Cloud production |
| Bucket visibility | Private (`public = false`), served via `createSignedUrl()` | Public bucket URLs bypass RLS entirely, which would defeat the department isolation boundary |
| `departments.logo_url` reuse | Stores the Storage object key (not a public URL) | Cheap "is a logo set" signal without a Storage probe call on every page load |

## Scope

**In scope:**
- Private `department-logos` Storage bucket + `storage.objects` RLS (SELECT/INSERT/UPDATE/DELETE), scoped by department via `storage.foldername(name)`
- New `UPDATE` RLS policy on `departments` (needed to write `logo_url`)
- `getDepartmentLogoUrl`/`setDepartmentLogo`/`removeDepartmentLogo` in `src/lib/services/departments.ts`
- `PUT`/`DELETE` on new `/api/departments/logo` route
- `DepartmentLogoManager.tsx` React island on `/employees` (thumbnail/placeholder, upload, inline remove-confirm)
- Smoke test coverage for upload/replace/remove + cross-department isolation

**Out of scope:**
- Embedding the logo into generated signature scripts/emails (S-04/S-05) — including whether a signed URL is even usable there
- Image resizing/cropping/format conversion
- Per-employee logo override, logo versioning/history
- Any role-based restriction beyond department membership

## Architecture / Approach

A new private Storage bucket is created via migration with RLS policies mirroring the `employees` isolation predicate, keyed on path segment (`"<department_id>/logo"`) instead of a `department_id` column. The service layer reads `departments.logo_url` (a stored object key) to cheaply know whether a logo is set, then derives a fresh signed URL on demand. The API route double-validates file type/size (client + server), with bucket-level `allowed_mime_types`/`file_size_limit` as a third layer of defense. The UI follows the existing fetch + full-page-reload pattern from `AddEmployeeForm.tsx`/`EmployeeTable.tsx`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Storage bucket + RLS | Private bucket, `storage.objects` policies, `departments` UPDATE policy | RLS predicate must correctly cast the folder-segment path to `uuid` |
| 2. Service + API | `departments.ts` service, `/api/departments/logo` (PUT/DELETE) | Double validation (client + server) must actually reject bad files, not just warn |
| 3. UI | `DepartmentLogoManager.tsx` wired into `/employees` | Reusing the inline-confirm pattern without over-complicating a small component |
| 4. Isolation testing | Extended smoke test for upload/replace/remove + cross-department negative case | Only real automated proof the new Storage RLS isolates correctly |

**Prerequisites:** F-01 (department-scoped data foundation) — done.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open Risks & Assumptions

- Allowing SVG uploads (a deviation from the recommended PNG/JPG-only option) means S-04 must separately decide whether SVG (and a private/signed URL in general) is usable inside a generated Outlook/Thunderbird signature script — not resolved here, deliberately deferred.
- The `departments` `UPDATE` RLS policy is row-scoped, not column-scoped; safety against updating other department fields (e.g. name) relies on the service layer only ever writing `logo_url`, not on RLS alone.
- No image resizing means a large-but-under-2MB image could render awkwardly in the UI/signature — deferred as out of scope.

## Success Criteria (Summary)

- A user can view, upload, replace, and remove their department's logo on `/employees`, scoped strictly to their own department.
- Cross-department access to another department's logo object or `departments` row is rejected by RLS.
- `npm run smoke` (extended), `npm run lint`, `npx astro check`, and `npm run build` all pass.
