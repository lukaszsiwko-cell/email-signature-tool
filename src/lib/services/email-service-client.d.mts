interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

interface EmailServiceConfig {
  fromAddress: string;
  publicAppUrl: string;
  allowLocalHttp: boolean;
}

interface SignatureEmail {
  to: string;
  token: string;
}

export function sendSignatureEmail(
  emailBinding: EmailBinding,
  config: EmailServiceConfig,
  message: SignatureEmail,
): Promise<void>;