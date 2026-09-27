# Set and Update Department Signature Logo Implementation Plan

## Overview

Implements FR-008: a help desk/IT user can set, replace, or remove the logo/graphic used across all signatures generated for their own department. Adds Supabase Storage as a new capability in this repo (first use), with the same department-scoped RLS isolation boundary already proven for `employees`.

## Current State Analysis

- `departments.logo_url` (text, nullable) already exists in the schema (`supabase/migrations/20260922193159_department_scoped_data_foundation.sql`) — the column was added in F-01 anticipating this slice, but nothing writes to it yet.
- No Supabase Storage bucket exists yet, anywhere in `supabase/migrations/`. Local dev has `[storage] enabled = true` in `supabase/config.toml` with a default 50MiB file size limit, but no bucket is declared.
- `src/lib/services/` has `employees.ts` only — no `departments.ts` yet, despite `departments` already being queried directly in `src/pages/auth/signup.astro` (Phase 2 of S-01) for the signup dropdown.
- `/employees` (`src/pages/employees.astro`) is the one department-scoped page in the app; per the interview decision, the logo section lives here rather than a new page.
- The existing `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies on `employees` (S-01/S-02) all use the identical predicate `exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.department_id = employees.department_id)` — this plan's Storage RLS policies reuse the same shape, adapted to `storage.objects`.

### Key Discoveries:

- Supabase Storage buckets and their RLS policies are ordinary Postgres rows (`storage.buckets`, `storage.objects`) and policies — they belong in a SQL migration (portable to both local dev and Supabase Cloud production), not in `supabase/config.toml` (`[storage.buckets.*]` is a local-dev-only declarative convenience and has no effect on a deployed project).
- `storage.objects` RLS policies conventionally scope by path segment via `storage.foldername(name)`, which returns an array of the object key's folder components — e.g. for key `"<department_id>/logo"`, `(storage.foldername(name))[1]` is the department id.
- Per NFR ("employee data, including logos, is never transmitted anywhere outside the company's own server"), the bucket is created **private** (`public = false`). Access is via `createSignedUrl()` for the caller's own department only, not a public bucket URL — consistent with how every other piece of employee data in this app is already gated by auth + RLS, not by obscurity.
- A single fixed storage key per department (`"<department_id>/logo"`, no file extension in the path) lets "upload a new logo" always overwrite in place (`upsert: true`) regardless of whether the file type changed (e.g. replacing a PNG with an SVG) — the actual MIME type is recorded as object metadata at upload time and read back from there when serving, not inferred from a file extension in the path.
- `departments.logo_url` (already in the schema from F-01) is repurposed to store the **storage object key** (`"<department_id>/logo"`), not a public URL despite its name — its presence/absence is the cheap "is a logo set" signal (avoids a Storage list/probe call on every page load), while the actual browser-usable URL is always derived fresh via `createSignedUrl()` since signed URLs expire.

## Desired End State

On `/employees`, a signed-in user sees their department's current logo (or a "no logo set" placeholder) at the top of the page, can upload a new PNG/JPG/SVG (max 2MB) to replace it, and can remove it entirely. Only members of the caller's own department can view, replace, or remove that department's logo — enforced by Postgres RLS on `storage.objects`, mirroring the existing `employees` isolation boundary.

Verification: `npm run smoke` passes, including new upload/replace/remove + cross-department isolation checks; `npx astro check` and `npm run lint` pass; a manual walkthrough confirms upload, replace, remove, and the empty-state placeholder.

## What We're NOT Doing

- Generating or emailing signature scripts that embed this logo (S-04, S-05) — this slice only stores and serves the logo file; how it gets embedded in an Outlook/Thunderbird script or email is S-04's design problem, including whether a private/signed URL is even usable there (it may need a different serving strategy, e.g. inlining the image bytes into the script instead of referencing a URL).
- Image resizing, cropping, or format conversion — the uploaded file is stored and served as-is (subject to the type/size validation below).
- A per-employee logo override — logo is strictly department-level, per FR-008 and F-01's schema.
- Versioning/history of previous logos — "replace" always overwrites the one stored file; no undo.
- Any admin-only restriction on who can set a department's logo — same access model as employees: any authenticated user in that department, per the PRD's Access Control section (row-level scoping, not a role hierarchy).
- Client-side image cropping/preview editing UI beyond a simple thumbnail + file picker.

## Implementation Approach

A new private Supabase Storage bucket `department-logos` is created via migration, with `storage.objects` RLS policies scoped by department using the same `profiles` join pattern as `employees`, keyed on the object's path segment rather than a `department_id` column. The service layer gains `src/lib/services/departments.ts` with functions to read (as a signed URL), set, and remove the logo — the department is always the caller's own, inferred server-side, never accepted as client input. A new `/api/departments/logo` route exposes `PUT` (upload) and `DELETE` (remove). The `/employees` page grows a new top section, `DepartmentLogoManager.tsx` (a React island), showing the current logo or a placeholder, with an upload input and a remove button — following the same fetch + full-page-reload pattern established by `AddEmployeeForm.tsx` and `EmployeeTable.tsx`.

## Critical Implementation Details

- **`storage.foldername(name)` is 1-indexed and returns folder segments only** (not the filename) — for key `"<department_id>/logo"`, `(storage.foldername(name))[1]` yields `"<department_id>"` as text; the RLS policy predicate casts it to `uuid` before comparing to `profiles.department_id`.
- **`upsert: true` on the Storage upload client call is what makes "replace" and "overwrite in place" work** without a separate delete-then-upload step — Supabase Storage's upload endpoint accepts an `x-upsert` header/option that replaces an existing object at the same key transactionally.
- **The bucket must be private (`public = false`) and reads must go through `createSignedUrl()`**, not a bucket-level public URL — this is the one place in the app so far where "isolated by RLS" and "isolated by not-being-publicly-addressable" both apply, since a public bucket URL would bypass RLS entirely (Storage's public-bucket serving path does not consult RLS).
- **MIME type and size are validated twice**: once client-side (fast UX feedback, per the interview's PNG/JPG/SVG + 2MB decision) and again server-side in the API route before calling Storage (never trust the client-declared `Content-Type` alone) — this mirrors the existing "warn but the server is still authoritative" posture used for phone validation in S-01.
- **The new `departments` `UPDATE` policy is row-scoped, not column-scoped**: Postgres RLS can't restrict *which columns* an authorized `UPDATE` touches, only *which rows*. Safety against a user renaming their department (instead of just setting its logo) comes from the service layer only ever issuing `update departments set logo_url = ...` — the same "server code is the real boundary, RLS is the isolation backstop" discipline already used for `department_id` inference on `employees`.

## Phase 1: Storage bucket and RLS policies

### Overview

Creates the private `department-logos` Storage bucket and adds `storage.objects` RLS policies scoped by department, using the same isolation predicate already proven on `employees`.

### Changes Required:

#### 1. Storage bucket + RLS migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_department_logo_storage.sql`

**Intent**: Establish the storage isolation boundary in a portable migration (works identically in local dev and Supabase Cloud), rather than a local-only `config.toml` bucket declaration.

**Contract**:
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('department-logos', 'department-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

-- departments only had a SELECT policy before this slice (F-01); setting a logo
-- requires letting a department's own members update their own department row.
create policy "users can update their own department"
  on public.departments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = departments.id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = departments.id
    )
  );

create policy "users can view their department's logo"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can upload their department's logo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can replace their department's logo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  )
  with check (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can delete their department's logo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );
```
The bucket-level `allowed_mime_types`/`file_size_limit` enforce the interview's PNG/JPG/SVG + 2MB decision at the Storage layer itself, as defense in depth alongside the API route's own validation.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the new migration cleanly on top of existing ones (exit code 0).
- `select public from storage.buckets where id = 'department-logos';` returns `false`.

#### Manual Verification:

- In Supabase Studio (local), confirm `storage.objects` shows four new policies (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) scoped to `authenticated` and the `department-logos` bucket, and `public.departments` shows a new `UPDATE` policy alongside the existing `SELECT`.
- Manually attempt (via SQL editor, impersonating a JWT for one department's user) to select/insert an object keyed under a different department's folder and confirm it's rejected.
- Manually attempt to update a different department's row (via SQL editor, impersonating a JWT for one department's user) and confirm it's rejected.

---

## Phase 2: Service layer and API

### Overview

Adds `src/lib/services/departments.ts` (get/set/remove logo) and a new `/api/departments/logo` route exposing `PUT`/`DELETE`, following the same auth/validation/error-shape conventions as the existing `/api/employees` routes.

### Changes Required:

#### 1. Department logo service

**File**: `src/lib/services/departments.ts` (new)

**Intent**: Centralize the three logo operations this slice needs, keeping the API route thin — same rationale as `employees.ts`.

**Contract**:
- `getDepartmentLogoUrl(supabase): Promise<string | null>` — reads the caller's own `department_id` and `departments.logo_url` (the stored object key, or null) via `profiles` joined to `departments` (using `auth.uid()`); if `logo_url` is null, returns `null` immediately (no Storage call). Otherwise calls `createSignedUrl()` on that key in the `department-logos` bucket (a short expiry such as 60 minutes is fine since the page re-fetches it on every load) and returns the signed URL.
- `setDepartmentLogo(supabase, file: { data: ArrayBuffer | Blob; contentType: string }): Promise<void>` — uploads to `"<department_id>/logo"` with `upsert: true` and the given `contentType` as object metadata, then updates `departments.logo_url` to that same key. The department id is the caller's own, from `profiles`, never client input.
- `removeDepartmentLogo(supabase): Promise<void>` — deletes the object at `"<department_id>/logo"` if present (idempotent — deleting a non-existent object is not an error) and sets `departments.logo_url` back to `null`.

#### 2. API route

**File**: `src/pages/api/departments/logo.ts` (new)

**Intent**: Expose upload/remove over HTTP, reusing the same auth-check and error-shape conventions as `/api/employees`.

**Contract**: `export const prerender = false;`. Both handlers first check `context.locals.user` (401 if absent) and construct the Supabase client (500 if not configured). `PUT`: expects `multipart/form-data` with a single `file` field; validates `file.type` is one of `image/png`, `image/jpeg`, `image/svg+xml` and `file.size <= 2 * 1024 * 1024` (2MB) before calling Storage — returns `400` with a clear message on either failure (this is the server-side half of the double validation from Critical Implementation Details); on success calls `setDepartmentLogo` and returns `200` with `{ logoUrl }` (the freshly signed URL). `DELETE`: calls `removeDepartmentLogo`, returns `200` on success (or `204`). Both catch unexpected errors into `500`, matching the existing routes.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- `PUT /api/departments/logo` with a valid PNG under 2MB succeeds and returns a working signed URL (verify by opening it in a browser while signed in).
- `PUT` with an oversized file or a disallowed MIME type (e.g. `application/pdf`) returns `400`.
- `PUT` as a user in department B against a logo previously set by department A does not affect department A's logo (separate keys — verify both departments retain their own correct logo after both have uploaded one).
- `DELETE /api/departments/logo` removes the logo; a subsequent read (via the service function or the `/employees` page) shows the "no logo" state.

---

## Phase 3: UI — logo section on the employees page

### Overview

Adds a `DepartmentLogoManager.tsx` React island to the top of `/employees`, showing the current logo (or a placeholder), with an upload control and a remove button.

### Changes Required:

#### 1. Fetch the current logo server-side

**File**: `src/pages/employees.astro`

**Intent**: Follow the existing pattern of server-side data resolution (as done for `employees` via `listEmployees`) rather than a client-side fetch on mount.

**Contract**: Call `getDepartmentLogoUrl(supabase)` alongside the existing `listEmployees(supabase)` call; pass the result as an `initialLogoUrl: string | null` prop to the new `<DepartmentLogoManager initialLogoUrl={...} client:load />`, rendered above the existing `<AddEmployeeForm />`.

#### 2. Logo manager component

**File**: `src/components/departments/DepartmentLogoManager.tsx` (new)

**Intent**: Give the user a self-contained way to view, replace, or remove their department's logo without leaving `/employees` — mirrors the fetch + full-reload pattern already used by `AddEmployeeForm.tsx`/`EmployeeTable.tsx`.

**Contract**: `client:load` React component, prop `{ initialLogoUrl: string | null }`. Renders a thumbnail (`<img>`) of `initialLogoUrl` when present, or a placeholder box with "No logo set" text when `null`. Below it, a file `<input type="file" accept="image/png,image/jpeg,image/svg+xml">` plus an "Upload" button (client-side pre-check of type/size before submitting, showing an inline error immediately for an obviously invalid file — the "double validation" from Critical Implementation Details), and — only when a logo is currently set — a "Remove logo" button with the same inline confirm pattern already established in `EmployeeTable.tsx` ("Are you sure? Yes/No"). "Upload" submits via `fetch("/api/departments/logo", { method: "PUT", body: formData })`; both upload and remove success paths do `window.location.assign("/employees")` on success (full reload, consistent with the rest of the app), and show an inline error on failure without reloading.

### Success Criteria:

#### Automated Verification:

- `npx astro check` and `npm run lint` pass.
- `npm run build` succeeds.

#### Manual Verification:

- With no logo set, `/employees` shows the placeholder; uploading a valid PNG replaces it with the thumbnail after reload.
- Uploading a new file when a logo already exists replaces the thumbnail (visually different image) after reload.
- Clicking "Remove logo" shows the inline confirm, and confirming clears the logo back to the placeholder after reload.
- Selecting an oversized or wrong-type file client-side shows an inline error without submitting a request.

---

## Phase 4: Smoke test coverage for logo upload/remove + isolation

### Overview

Extends `scripts/smoke.mjs` with logo upload, replace, and remove flows, including the cross-department negative case, following the pattern established in S-01 Phase 5 and S-02 Phase 4.

### Changes Required:

#### 1. Smoke test steps

**File**: `scripts/smoke.mjs`

**Intent**: Provide the only real automated proof that the new Storage RLS policies correctly enforce department isolation on the logo file, not just on `employees` rows.

**Contract**: Reusing the existing multi-jar cookie/user setup, add steps for: (1) `PUT /api/departments/logo` for the first user succeeds and returns a signed URL; (2) fetching that signed URL directly returns the uploaded bytes (status `200`); (3) the second user (different department) uploading their own logo does not affect or expose the first user's logo — verified by re-fetching the first user's logo URL and confirming it's unchanged, and confirming the two departments' signed URLs point at different storage keys; (4) `DELETE /api/departments/logo` for the first user succeeds and a subsequent read shows no logo set.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes all steps, including the new logo upload/replace/remove/isolation checks.

#### Manual Verification:

- None beyond the automated smoke run — this phase is testing-only.

---

## Testing Strategy

- **Unit tests**: None (documented convention: `scripts/smoke.mjs` is the only automated check).
- **Integration tests**: `scripts/smoke.mjs` extended per Phase 4, run against a local Supabase + dev server.
- **Manual testing**: Each phase's Manual Verification steps above, using the two department-distinct test accounts established in S-01/S-02.

## Migration Notes

No data migration needed for existing rows — `departments.logo_url` is currently unused (always null) and this slice starts writing to it as the storage-object-key marker described in Key Discoveries, not a public URL. No backfill required.

## References

- Original request: roadmap item S-03 (`context/foundation/roadmap.md`), PRD FR-008 (`context/foundation/prd.md`)
- Related plans: `context/changes/add-and-list-employees/plan.md` (RLS/service/API/UI pattern origin), `context/changes/edit-and-delete-employee/plan.md` (inline-UI + smoke-test extension pattern)

## Progress

### Phase 1: Storage bucket and RLS policies

#### Automated
- [x] 1.1 `npx supabase db reset` applies the new migration cleanly — 551f1b3
- [x] 1.2 `department-logos` bucket is private (`public = false`) — 551f1b3

#### Manual
- [x] 1.3 `storage.objects` shows the four new policies; `public.departments` shows the new `UPDATE` policy — 551f1b3
- [x] 1.4 Cross-department object select/insert is rejected — 551f1b3
- [x] 1.5 Cross-department `departments` row update is rejected — 551f1b3

### Phase 2: Service layer and API

#### Automated
- [x] 2.1 `npx astro check` and `npm run lint` pass
- [x] 2.2 `npm run build` succeeds

#### Manual
- [x] 2.3 `PUT` with a valid PNG under 2MB succeeds and returns a working signed URL
- [x] 2.4 `PUT` with an oversized file or disallowed MIME type returns 400
- [x] 2.5 Cross-department uploads don't affect each other's logo
- [x] 2.6 `DELETE` removes the logo; subsequent read shows "no logo"

### Phase 3: UI — logo section on the employees page

#### Automated
- [ ] 3.1 `npx astro check` and `npm run lint` pass
- [ ] 3.2 `npm run build` succeeds

#### Manual
- [ ] 3.3 No-logo placeholder renders; valid upload shows thumbnail after reload
- [ ] 3.4 Replacing an existing logo shows the new thumbnail after reload
- [ ] 3.5 Remove-logo inline confirm clears back to placeholder after reload
- [ ] 3.6 Client-side rejects oversized/wrong-type file before submitting

### Phase 4: Smoke test coverage for logo upload/remove + isolation

#### Automated
- [ ] 4.1 `npm run smoke` passes, including new logo upload/replace/remove/isolation checks
