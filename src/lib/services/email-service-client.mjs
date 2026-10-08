export async function sendSignatureEmail(emailTransport, config, message) {
  if (!emailTransport || !config.fromAddress || !config.publicAppUrl) {
    throw new Error("Gmail SMTP is not configured");
  }

  const appUrl = new URL(config.publicAppUrl);
  const isLocalHttp =
    config.allowLocalHttp && appUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(appUrl.hostname);
  if (appUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Public app URL must use HTTPS");
  }

  const downloadUrl = new URL("/download-signatures", appUrl);
  downloadUrl.hash = message.token;

  try {
    await emailTransport.sendMail({
      from: config.fromAddress,
      to: message.to,
      subject: "Pliki z podpisem e-mail",
      text: `Pobierz pliki z podpisem e-mail, korzystając z jednorazowego linku:\n\n${downloadUrl}\n\nLink wygaśnie za 24 godziny. Otwórz go i wybierz „Pobierz pliki z podpisem”, aby pobrać pliki dla Outlooka i Thunderbirda.`,
    });
  } catch (error) {
    const transportCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const code =
      transportCode === "EAUTH"
        ? "E_SMTP_AUTH_FAILED"
        : ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "EPIPE"].includes(transportCode)
          ? "E_SMTP_CONNECTION_FAILED"
          : "E_SMTP_SEND_FAILED";
    const wrappedError = new Error("Gmail SMTP rejected the message");
    wrappedError.code = code;
    throw wrappedError;
  }
}
