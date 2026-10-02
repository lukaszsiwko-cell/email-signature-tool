declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}

declare module "cloudflare:workers" {
  export const env: {
    EMAIL: {
      send(message: {
        from: string;
        to: string;
        subject: string;
        text: string;
      }): Promise<{ messageId: string }>;
    };
  };
}
