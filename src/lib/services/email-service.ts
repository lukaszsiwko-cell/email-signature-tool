import { Resend } from "resend";
import { EMAIL_FROM, RESEND_API_KEY, PUBLIC_APP_URL } from "astro:env/server";
import { sendSignatureEmail } from "@/lib/services/email-service-client.mjs";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(EMAIL_FROM && RESEND_API_KEY && PUBLIC_APP_URL);
}

export async function sendSignatureDeliveryEmail(to: string, token: string): Promise<void> {
  if (!EMAIL_FROM || !RESEND_API_KEY || !PUBLIC_APP_URL) {
    throw new Error("Resend is not configured");
  }

  const transport = new Resend(RESEND_API_KEY);

  await sendSignatureEmail(
    transport,
    {
      fromAddress: EMAIL_FROM,
      publicAppUrl: PUBLIC_APP_URL,
      allowLocalHttp: import.meta.env.DEV,
    },
    { to, token },
  );
}
