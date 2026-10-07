import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getEmployeeById } from "@/lib/services/employees";
import { createSignatureDelivery, revokeSignatureDelivery } from "@/lib/services/signature-deliveries";
import { isEmailDeliveryConfigured, sendSignatureDeliveryEmail } from "@/lib/services/email-service";

export const prerender = false;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  const { id } = context.params;
  if (!id) {
    return jsonResponse({ error: "Employee id is required" }, 400);
  }
  try {
    const employee = await getEmployeeById(supabase, id);
    if (!employee) {
      return jsonResponse({ error: "Employee not found" }, 404);
    }
    if (!employee.email) {
      return jsonResponse({ error: "Employee email is required" }, 409);
    }
    if (!isEmailDeliveryConfigured()) {
      return jsonResponse({ error: "Company email service is not configured" }, 503);
    }

    const delivery = await createSignatureDelivery(supabase, employee);
    try {
      await sendSignatureDeliveryEmail(employee.email, delivery.token);
    } catch (error) {
      await revokeSignatureDelivery(supabase, delivery.token).catch(() => undefined);
      const code =
        error instanceof Error && "code" in error && typeof error.code === "string" && /^E_[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : "UNKNOWN";
      console.error("Signature email send rejected", code);
      return jsonResponse({ error: "Unable to send signature email", code }, 502);
    }

    return jsonResponse({ sent: true, expiresAt: delivery.expiresAt }, 202);
  } catch {
    return jsonResponse({ error: "Unable to prepare signature email" }, 500);
  }
};
