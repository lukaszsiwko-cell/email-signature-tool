import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignatureArtifactsDTO } from "@/types";

function downloadArtifact(contents: string, filename: string, contentType: string) {
  const objectUrl = URL.createObjectURL(new Blob([contents], { type: contentType }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export default function SignatureDownload() {
  const [artifacts, setArtifacts] = useState<SignatureArtifactsDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  async function redeem() {
    const token = window.location.hash.slice(1);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setMessage("This download link is unavailable or expired.");
      return;
    }

    setIsRedeeming(true);
    setMessage(null);
    try {
      const response = await fetch("/api/signature-download/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as Partial<SignatureArtifactsDTO> | null;
      if (
        !response.ok ||
        typeof body?.outlookHtml !== "string" ||
        typeof body.thunderbirdInstaller !== "string" ||
        typeof body.thunderbirdLauncher !== "string"
      ) {
        setMessage("This download link is unavailable or expired.");
        return;
      }

      setArtifacts(body as SignatureArtifactsDTO);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch {
      setMessage("The download service is unavailable. Try again later.");
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-4">
      <section className="w-full rounded-xl border border-border bg-card p-8 text-foreground shadow-xl">
        <h1 className="mb-3 text-2xl font-bold">Email signatures</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Retrieve the signature files for your email account. The link can only be used once.
        </p>

        {artifacts ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={() => downloadArtifact(artifacts.outlookHtml, "new-outlook-signature.html", "text/html;charset=utf-8")}
            >
              <Download className="size-4" />
              Download New Outlook signature
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadArtifact(artifacts.thunderbirdInstaller, "thunderbird-installer.ps1", "text/plain;charset=utf-8")
              }
            >
              <Download className="size-4" />
              Download Thunderbird installer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadArtifact(artifacts.thunderbirdLauncher, "thunderbird-installer.cmd", "text/plain;charset=utf-8")
              }
            >
              <Download className="size-4" />
              Download Thunderbird launcher
            </Button>
          </div>
        ) : (
          <Button type="button" disabled={isRedeeming} onClick={() => void redeem()}>
            {isRedeeming ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {isRedeeming ? "Checking link..." : "Get signature files"}
          </Button>
        )}

        {message ? <p className="mt-4 text-sm text-destructive" role="alert">{message}</p> : null}
      </section>
    </main>
  );
}