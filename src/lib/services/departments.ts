import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const DEPARTMENT_LOGOS_BUCKET = "department-logos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface DepartmentLogoProfileRow {
  department_id: string;
  departments: { logo_url: string | null } | { logo_url: string | null }[] | null;
}

async function getOwnDepartmentId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("department_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return profile.department_id as string;
}

function getLogoKey(profile: DepartmentLogoProfileRow): string | null {
  if (Array.isArray(profile.departments)) {
    return profile.departments[0]?.logo_url ?? null;
  }

  return profile.departments?.logo_url ?? null;
}

/**
 * Returns the caller's current department logo as a fresh signed URL. The
 * department is resolved server-side from the caller's own profile, so the
 * client can never ask for another department's logo key directly.
 */
export async function getDepartmentLogoUrl(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("department_id, departments!inner(logo_url)")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const logoKey = getLogoKey(profile);
  if (!logoKey) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(DEPARTMENT_LOGOS_BUCKET)
    .createSignedUrl(logoKey, SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

/**
 * Uploads or replaces the caller's department logo at the fixed per-department
 * storage key. The department id is always inferred from the caller's own
 * profile, never accepted from client input.
 */
export async function setDepartmentLogo(
  supabase: SupabaseClient,
  file: { data: ArrayBuffer | Blob; contentType: string },
): Promise<void> {
  const departmentId = await getOwnDepartmentId(supabase);
  const logoKey = `${departmentId}/logo`;

  const { error: uploadError } = await supabase.storage.from(DEPARTMENT_LOGOS_BUCKET).upload(logoKey, file.data, {
    upsert: true,
    contentType: file.contentType,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: updateError } = await supabase
    .from("departments")
    .update({ logo_url: logoKey })
    .eq("id", departmentId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

/**
 * Removes the caller's department logo and clears the stored logo key on the
 * department row. The caller never supplies a department id, so one
 * department can't target another even with a tampered request.
 */
export async function removeDepartmentLogo(supabase: SupabaseClient): Promise<void> {
  const departmentId = await getOwnDepartmentId(supabase);
  const logoKey = `${departmentId}/logo`;

  const { error: removeError } = await supabase.storage.from(DEPARTMENT_LOGOS_BUCKET).remove([logoKey]);

  if (removeError) {
    throw new Error(removeError.message);
  }

  const { error: updateError } = await supabase.from("departments").update({ logo_url: null }).eq("id", departmentId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
