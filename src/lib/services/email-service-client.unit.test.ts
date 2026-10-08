import { describe, expect, it, vi } from "vitest";

import { sendSignatureEmail } from "./email-service-client.mjs";

describe("sendSignatureEmail", () => {
  it("sends the signature download email in Polish", async () => {
    let sentMessage: { subject: string; text: string } | undefined;
    const emailTransport = {
      emails: {
        send: (message: { subject: string; text: string }) => {
          sentMessage = message;
          return Promise.resolve({ data: { id: "test-message" }, error: null });
        },
      },
    };

    await sendSignatureEmail(
      emailTransport,
      { fromAddress: "signatures@example.test", publicAppUrl: "https://example.test", allowLocalHttp: false },
      { to: "employee@example.test", token: "a".repeat(64) },
    );

    expect(sentMessage?.subject).toBe("Pliki z podpisem e-mail");
    expect(sentMessage?.text).toContain("Pobierz pliki z podpisem e-mail");
    expect(sentMessage?.text).toContain("https://example.test/download-signatures#");
    expect(sentMessage?.text).toContain("Link wygaśnie za 24 godziny");
    expect(sentMessage?.text).not.toContain("Download your email signature files");
  });

  it.each([
    [401, "E_EMAIL_AUTH_FAILED"],
    [403, "E_EMAIL_SEND_FAILED"],
    [429, "E_EMAIL_RATE_LIMITED"],
    [500, "E_EMAIL_SEND_FAILED"],
  ])("handles provider status %s without leaking diagnostics", async (statusCode, code) => {
    const emailTransport = {
      emails: { send: vi.fn().mockResolvedValue({ data: null, error: { statusCode, message: "private diagnostic" } }) },
    };
    await expect(
      sendSignatureEmail(
        emailTransport,
        { fromAddress: "signatures@example.test", publicAppUrl: "https://example.test" },
        { to: "employee@example.test", token: "a".repeat(64) },
      ),
    ).rejects.toMatchObject({ message: "Resend rejected the message", code });
  });

  it("handles network failures without leaking diagnostics", async () => {
    const emailTransport = { emails: { send: vi.fn().mockRejectedValue(new Error("private diagnostic")) } };
    await expect(
      sendSignatureEmail(
        emailTransport,
        { fromAddress: "signatures@example.test", publicAppUrl: "https://example.test" },
        { to: "employee@example.test", token: "a".repeat(64) },
      ),
    ).rejects.toMatchObject({ message: "Resend connection failed", code: "E_EMAIL_CONNECTION_FAILED" });
  });

  it("rejects a response without an email id", async () => {
    const emailTransport = { emails: { send: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
    await expect(
      sendSignatureEmail(
        emailTransport,
        { fromAddress: "signatures@example.test", publicAppUrl: "https://example.test" },
        { to: "employee@example.test", token: "a".repeat(64) },
      ),
    ).rejects.toMatchObject({ code: "E_EMAIL_SEND_FAILED" });
  });

  it("rejects an insecure URL before calling Resend", async () => {
    const send = vi.fn();
    await expect(
      sendSignatureEmail(
        { emails: { send } },
        { fromAddress: "signatures@example.test", publicAppUrl: "http://example.test" },
        { to: "employee@example.test", token: "a".repeat(64) },
      ),
    ).rejects.toThrow("Public app URL must use HTTPS");
    expect(send).not.toHaveBeenCalled();
  });
});
