import { EMAIL_FROM, PUBLIC_APP_URL } from "astro:env/server";
import { env } from "cloudflare:workers";
import { sendSignatureEmail } from "@/lib/services/email-service-client.mjs";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(EMAIL_FROM && PUBLIC_APP_URL && env.EMAIL);
}

export async function sendSignatureDeliveryEmail(to: string, token: string): Promise<void> {
  if (!EMAIL_FROM || !PUBLIC_APP_URL || !env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }

  await sendSignatureEmail(
    env.EMAIL,
    {
      fromAddress: EMAIL_FROM,
      publicAppUrl: PUBLIC_APP_URL,
      allowLocalHttp: import.meta.env.DEV,
    },
    { to, token },
  );
}