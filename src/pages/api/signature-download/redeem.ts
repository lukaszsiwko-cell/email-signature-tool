import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const redeemSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "This download link is unavailable." }, 404);
  }

  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "This download link is unavailable." }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Download service is unavailable." }, 503);
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.data.token));
  const tokenHash = toHex(new Uint8Array(digest));
  const rpcResult: unknown = await supabase.rpc("redeem_signature_delivery", { p_token_hash: tokenHash });
  if (!rpcResult || typeof rpcResult !== "object" || !("data" in rpcResult) || !("error" in rpcResult)) {
    return jsonResponse({ error: "Download service is unavailable." }, 503);
  }
  const { data, error } = rpcResult;

  if (error) {
    return jsonResponse({ error: "Download service is unavailable." }, 503);
  }
  if (!data) {
    return jsonResponse({ error: "This download link is unavailable." }, 404);
  }

  return jsonResponse(data, 200);
};
