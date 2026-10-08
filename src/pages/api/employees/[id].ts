import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { DuplicateEmployeeEmailError, updateEmployee, deleteEmployee } from "@/lib/services/employees";

export const prerender = false;

// Same shape as the create schema in ./index.ts — department is never part
// of the payload, so a tampered request body can't retarget another
// department's employee.
const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(254).pipe(z.email("Enter a valid email address")).nullable().optional(),
  ),
  position: z.string().trim().min(1, "Position is required"),
  // Optional and permissive per the PRD's warn-don't-block rule — shape is
  // only validated on the client (as a non-blocking hint), never enforced here.
  phone: z.string().trim().optional().default(""),
});

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }

  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Employee id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await parseBody(context.request);
  const parsed = updateEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", fieldErrors: z.treeifyError(parsed.error).properties }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const employee = await updateEmployee(supabase, id, parsed.data);
    if (!employee) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(employee), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof DuplicateEmployeeEmailError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Employee id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const deleted = await deleteEmployee(supabase, id);
    if (!deleted) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
