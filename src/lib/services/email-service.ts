import nodemailer from "nodemailer";
import { EMAIL_FROM, GMAIL_SMTP_APP_PASSWORD, GMAIL_SMTP_USERNAME, PUBLIC_APP_URL } from "astro:env/server";
import { sendSignatureEmail } from "@/lib/services/email-service-client.mjs";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(EMAIL_FROM && GMAIL_SMTP_USERNAME && GMAIL_SMTP_APP_PASSWORD && PUBLIC_APP_URL);
}

export async function sendSignatureDeliveryEmail(to: string, token: string): Promise<void> {
  if (!EMAIL_FROM || !GMAIL_SMTP_USERNAME || !GMAIL_SMTP_APP_PASSWORD || !PUBLIC_APP_URL) {
    throw new Error("Gmail SMTP is not configured");
  }

  const smtpUsername = String(GMAIL_SMTP_USERNAME);
  const smtpAppPassword = String(GMAIL_SMTP_APP_PASSWORD);
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: smtpUsername,
      pass: smtpAppPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.verify();
    console.log("GMAIL SMTP AUTH OK");
  } catch (err) {
    console.error("SMTP ERROR:", err);
  }

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
