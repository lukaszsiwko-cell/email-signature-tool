export async function sendSignatureEmail(emailBinding, config, message) {
  if (!emailBinding || !config.fromAddress || !config.publicAppUrl) {
    throw new Error("Cloudflare Email Service is not configured");
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
    await emailBinding.send({
      from: config.fromAddress,
      to: message.to,
      subject: "Your email signature files",
      text: `Download your email signature files using this one-time link:\n\n${downloadUrl}\n\nThe link expires in 24 hours. Open it and choose Get signature files to download the Outlook and Thunderbird files.`,
    });
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^E_[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : "UNKNOWN";
    const wrappedError = new Error("Cloudflare Email Service rejected the message");
    wrappedError.code = code;
    throw wrappedError;
  }
}