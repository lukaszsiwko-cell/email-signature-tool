import { describe, expect, it } from "vitest";

import { sendSignatureEmail } from "./email-service-client.mjs";

describe("sendSignatureEmail", () => {
  it("sends the signature download email in Polish", async () => {
    let sentMessage: { subject: string; text: string } | undefined;
    const emailTransport = {
      sendMail: (message: { subject: string; text: string }) => {
        sentMessage = message;
        return Promise.resolve({ messageId: "test-message" });
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
});
