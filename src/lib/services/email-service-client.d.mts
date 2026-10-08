interface EmailTransport {
  emails: {
    send(message: { from: string; to: string; subject: string; text: string }): Promise<{
      data: { id?: string } | null;
      error: { statusCode?: number | null; message?: string } | null;
    }>;
  };
}

interface EmailServiceConfig {
  fromAddress: string;
  publicAppUrl: string;
  allowLocalHttp?: boolean;
}

interface SignatureEmail {
  to: string;
  token: string;
}

export function sendSignatureEmail(
  emailTransport: EmailTransport,
  config: EmailServiceConfig,
  message: SignatureEmail,
): Promise<void>;
