function redactDiagnostic(value) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:re|rk)_[A-Z0-9_-]+\b/gi, "[API_KEY]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 300);
}

function getSafeDiagnostic(error, includeCause = true) {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError", message: "A non-error value was thrown" };
  }

  const diagnostic = {
    name: typeof error.name === "string" ? redactDiagnostic(error.name) : "Error",
    message: typeof error.message === "string" ? redactDiagnostic(error.message) : "No error message",
  };

  if (typeof error.code === "string" && /^[A-Z0-9_-]{1,64}$/i.test(error.code)) {
    diagnostic.code = error.code;
  }

  if (includeCause && error.cause && typeof error.cause === "object") {
    diagnostic.cause = getSafeDiagnostic(error.cause, false);
  }

  return diagnostic;
}

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
  } catch (error) {
    console.error("Resend request threw while sending signature email", getSafeDiagnostic(error));
    const wrappedError = new Error("Resend connection failed");
    wrappedError.code = "E_EMAIL_CONNECTION_FAILED";
    throw wrappedError;
  }

  if (result?.error || !result?.data?.id) {
    const status = result?.error?.statusCode;
    console.error(
      "Resend rejected signature email",
      result?.error
        ? { statusCode: typeof status === "number" ? status : undefined, ...getSafeDiagnostic(result.error) }
        : { message: "Resend response did not include a message ID" },
    );
    const wrappedError = new Error("Resend rejected the message");
    wrappedError.code =
      status === 401 ? "E_EMAIL_AUTH_FAILED" : status === 429 ? "E_EMAIL_RATE_LIMITED" : "E_EMAIL_SEND_FAILED";
    throw wrappedError;
  }
}
