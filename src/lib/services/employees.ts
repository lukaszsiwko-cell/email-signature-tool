import type { createClient } from "@/lib/supabase";
import type { EmployeeDTO, CreateEmployeeInput } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  phone: string;
  created_at: string;
}

function toDTO(row: EmployeeRow): EmployeeDTO {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    position: row.position,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

/**
 * Lists employees visible to the caller. RLS narrows results to the caller's
 * own department automatically — no department_id filter is written here.
 */
export async function listEmployees(supabase: SupabaseClient): Promise<EmployeeDTO[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, position, phone, created_at")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as EmployeeRow[]).map(toDTO);
}

/** Returns an employee visible to the caller, or null when RLS hides the row. */
export async function getEmployeeById(supabase: SupabaseClient, id: string): Promise<EmployeeDTO | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, position, phone, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toDTO(data) : null;
}

/**
 * Creates an employee in the caller's own department. The department is
 * always inferred server-side from the caller's profile — never taken from
 * client input — so a tampered request body can't target another department
 * even if RLS were ever misconfigured.
 */
export async function createEmployee(supabase: SupabaseClient, input: CreateEmployeeInput): Promise<EmployeeDTO> {
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

  const { data, error } = await supabase
    .from("employees")
    .insert({
      department_id: profile.department_id,
      first_name: input.firstName,
      last_name: input.lastName,
      position: input.position,
      phone: input.phone,
    })
    .select("id, first_name, last_name, position, phone, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return toDTO(data);
}

/**
 * Updates an employee's fields. Never accepts or writes department_id —
 * RLS alone determines whether the row is reachable. Returns null when no
 * row was affected (id not found, or belongs to another department), since
 * that's indistinguishable from "not found" once RLS hides the row — the
 * caller maps this to a 404, not a 500.
 */
export async function updateEmployee(
  supabase: SupabaseClient,
  id: string,
  input: CreateEmployeeInput,
): Promise<EmployeeDTO | null> {
  const { data, error } = await supabase
    .from("employees")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      position: input.position,
      phone: input.phone,
    })
    .eq("id", id)
    .select("id, first_name, last_name, position, phone, created_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toDTO(data) : null;
}

/**
 * Deletes an employee. Returns false when no row was affected (id not
 * found, or belongs to another department) so the caller can map this to a
 * 404 rather than treating it as a generic error.
 */
export async function deleteEmployee(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("employees").delete().eq("id", id).select("id").maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data !== null;
}
