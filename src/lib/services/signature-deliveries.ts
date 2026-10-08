import type { createClient } from "@/lib/supabase";
import type { EmployeeDTO } from "@/types";
import { getDepartmentLogoAsset } from "@/lib/services/departments";
import { generateSignatureArtifacts } from "@/lib/services/signatures";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export async function createSignatureDelivery(
  supabase: SupabaseClient,
  employee: EmployeeDTO,
): Promise<{ token: string; expiresAt: string }> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashToken(token);
  const logo = await getDepartmentLogoAsset(supabase);
  const artifactBundle = generateSignatureArtifacts(employee, logo);
  const expiresAt = new Date(Date.now() + DELIVERY_TTL_MS).toISOString();

  const { error } = await supabase.from("signature_deliveries").insert({
    department_id: await getEmployeeDepartmentId(supabase, employee.id),
    employee_id: employee.id,
    token_hash: tokenHash,
    artifact_bundle: artifactBundle,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { token, expiresAt };
}

export async function revokeSignatureDelivery(supabase: SupabaseClient, token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  const { error } = await supabase.rpc("revoke_signature_delivery", { p_token_hash: tokenHash });
  if (error) {
    throw new Error(error.message);
  }
}

async function getEmployeeDepartmentId(supabase: SupabaseClient, employeeId: string): Promise<string> {
  const { data, error } = await supabase.from("employees").select("department_id").eq("id", employeeId).single();

  if (error) {
    throw new Error(error.message);
  }

  return data.department_id;
}
