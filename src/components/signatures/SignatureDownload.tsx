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
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export default function SignatureDownload() {
  const [artifacts, setArtifacts] = useState<SignatureArtifactsDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  async function redeem() {
    const token = window.location.hash.slice(1);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setMessage("Ten link do pobrania jest niedostępny lub wygasł.");
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
        setMessage("Ten link do pobrania jest niedostępny lub wygasł.");
        return;
      }

      setArtifacts(body as SignatureArtifactsDTO);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch {
      setMessage("Usługa pobierania jest niedostępna. Spróbuj ponownie później.");
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-4">
      <section className="border-border bg-card text-foreground w-full rounded-xl border p-8 shadow-xl">
        <h1 className="mb-3 text-2xl font-bold">Podpisy e-mail</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Pobierz pliki z podpisem do swojej poczty. Link można wykorzystać tylko raz.
        </p>

        {artifacts ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={() => {
                downloadArtifact(artifacts.outlookHtml, "podpis-nowy-outlook.html", "text/html;charset=utf-8");
              }}
            >
              <Download className="size-4" />
              Pobierz podpis dla nowego Outlooka
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                downloadArtifact(
                  artifacts.thunderbirdInstaller,
                  "instalator-thunderbird.ps1",
                  "text/plain;charset=utf-8",
                );
              }}
            >
              <Download className="size-4" />
              Pobierz skrypt instalatora (.ps1)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                downloadArtifact(
                  artifacts.thunderbirdLauncher,
                  "instalator-thunderbird.cmd",
                  "text/plain;charset=utf-8",
                );
              }}
            >
              <Download className="size-4" />
              Pobierz plik uruchamiający (.cmd)
            </Button>
            <div className="text-muted-foreground text-sm">
              <p className="mb-2 font-medium">Automatyczna instalacja podpisu w Thunderbirdzie</p>
              <p className="mb-2">
                Wymagany jest Windows z Windows PowerShell 5.1 lub nowszym (powershell.exe) oraz Thunderbird z
                skonfigurowanym kontem pocztowym.
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Pobierz oba pliki: instalator-thunderbird.ps1 i instalator-thunderbird.cmd. Zapisz je w tym samym
                  folderze, bez zmiany nazw.
                </li>
                <li>Zapisz swoją pracę i zamknij Thunderbirda.</li>
                <li>
                  Otwórz instalator-thunderbird.cmd — uruchomi skrypt PowerShell. Wybierz profil i konto, dla którego
                  chcesz ustawić podpis.
                </li>
                <li>Otwórz ponownie Thunderbirda i sprawdź podpis w nowej wiadomości.</li>
              </ol>
              <p className="mt-2">
                Instalator zapisuje kopię zapasową ustawień. Nie wymaga uruchamiania jako administrator. Jeśli
                organizacja blokuje skrypty PowerShell, skontaktuj się z działem IT.
              </p>
            </div>
          </div>
        ) : (
          <Button type="button" disabled={isRedeeming} onClick={() => void redeem()}>
            {isRedeeming ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {isRedeeming ? "Sprawdzanie linku..." : "Pobierz pliki z podpisem"}
          </Button>
        )}

        {message ? (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
