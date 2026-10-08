export async function sendSignatureEmail(emailTransport, config, message) {
  const sendEmail = emailTransport?.emails?.send;

  if (!sendEmail || !config?.fromAddress || !config?.publicAppUrl) {
    throw new Error("Resend is not configured");
  }

  let appUrl;
  try {
    appUrl = new URL(config.publicAppUrl);
  } catch {
    throw new Error("Public app URL must use HTTPS");
  }

  const isLocalHttp =
    config.allowLocalHttp && appUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(appUrl.hostname);
  if (appUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Public app URL must use HTTPS");
  }

  const downloadUrl = new URL("/download-signatures", appUrl);
  if (message?.token) {
    downloadUrl.hash = message.token;
  }

  let result;
  try {
    result = await sendEmail({
      from: config.fromAddress,
      to: message.to,
      subject: "Pliki z podpisem e-mail",
      text: `Pobierz pliki z podpisem e-mail, korzystając z jednorazowego linku:\n\n${downloadUrl}\n\nLink wygaśnie za 24 godziny. Otwórz go i wybierz „Pobierz pliki z podpisem”, aby pobrać pliki dla Outlooka i Thunderbirda.`,
    });
  } catch {
    const wrappedError = new Error("Resend connection failed");
    wrappedError.code = "E_EMAIL_CONNECTION_FAILED";
    throw wrappedError;
  }

  if (result?.error || !result?.data?.id) {
    const status = result?.error?.statusCode;
    const wrappedError = new Error("Resend rejected the message");
    wrappedError.code =
      status === 401 ? "E_EMAIL_AUTH_FAILED" : status === 429 ? "E_EMAIL_RATE_LIMITED" : "E_EMAIL_SEND_FAILED";
    throw wrappedError;
  }
}
