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
      subject: "Your email signature files",
      text: `Download your email signature files using this one-time link:\n\n${downloadUrl}\n\nThe link expires in 24 hours. Open it and choose Get signature files to download the Outlook and Thunderbird files.`,
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
