import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createSignatureDelivery } from "@/lib/services/signature-deliveries";
import { getEmployeeById } from "@/lib/services/employees";

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
    const delivery = await createSignatureDelivery(supabase, employee);
    return jsonResponse(
      {
        downloadUrl: `/download-signatures#${delivery.token}`,
        expiresAt: delivery.expiresAt,
      },
      201,
    );
  } catch {
    return jsonResponse({ error: "Unable to create signature download" }, 500);
  }
};
