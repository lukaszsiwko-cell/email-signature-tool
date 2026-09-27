import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getDepartmentLogoUrl, removeDepartmentLogo, setDepartmentLogo } from "@/lib/services/departments";

export const prerender = false;

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function parseLogoFile(request: Request): Promise<File | null> {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return null;
  }

  return file;
}

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  const file = await parseLogoFile(context.request);
  if (!file) {
    return jsonResponse({ error: "A file field is required" }, 400);
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return jsonResponse({ error: "File must be a PNG, JPG, or SVG image" }, 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonResponse({ error: "File must be 2MB or smaller" }, 400);
  }

  try {
    await setDepartmentLogo(supabase, {
      data: await file.arrayBuffer(),
      contentType: file.type,
    });
    const logoUrl = await getDepartmentLogoUrl(supabase);

    return jsonResponse({ logoUrl }, 200);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  try {
    await removeDepartmentLogo(supabase);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};
