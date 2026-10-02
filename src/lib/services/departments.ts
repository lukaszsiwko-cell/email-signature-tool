import type { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const DEPARTMENT_LOGOS_BUCKET = "department-logos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface DepartmentLogoProfileRow {
  department_id: string;
  departments: { logo_url: string | null } | { logo_url: string | null }[] | null;
}

export interface DepartmentLogoAsset {
  data: Uint8Array;
  contentType: string;
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
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error("Your account is missing a department profile. Contact an administrator to restore access.");
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
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error("Your account is missing a department profile. Contact an administrator to restore access.");
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
 * Downloads the caller's department logo through Storage RLS for generated
 * artifacts. The returned bytes never pass through a public or signed URL.
 */
export async function getDepartmentLogoAsset(supabase: SupabaseClient): Promise<DepartmentLogoAsset | null> {
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
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error("Your account is missing a department profile. Contact an administrator to restore access.");
  }

  const logoKey = getLogoKey(profile);
  if (!logoKey) {
    return null;
  }

  const { data, error } = await supabase.storage.from(DEPARTMENT_LOGOS_BUCKET).download(logoKey);
  if (error) {
    throw new Error(error.message);
  }

  const contentType = data.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/svg+xml"].includes(contentType) || data.size > 2 * 1024 * 1024) {
    throw new Error("Department logo has an unsupported type or size");
  }

  return {
    data: new Uint8Array(await data.arrayBuffer()),
    contentType,
  };
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
