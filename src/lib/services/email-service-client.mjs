export async function sendSignatureEmail(emailTransport, config, message) {
  if (!emailTransport || !config.fromAddress || !config.publicAppUrl) {
    throw new Error("Resend is not configured");
  }

  const appUrl = new URL(config.publicAppUrl);
  const isLocalHttp =
    config.allowLocalHttp && appUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(appUrl.hostname);
  if (appUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Public app URL must use HTTPS");
  }

  const downloadUrl = new URL("/download-signatures", appUrl);
  downloadUrl.hash = message.token;

  let result;
  try {
    result = await emailTransport.emails.send({
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

  if (result.error || !result.data?.id) {
    const status = result.error?.statusCode;
    const wrappedError = new Error("Resend rejected the message");
    wrappedError.code =
      status === 401 ? "E_EMAIL_AUTH_FAILED" : status === 429 ? "E_EMAIL_RATE_LIMITED" : "E_EMAIL_SEND_FAILED";
    throw wrappedError;
  }
}
