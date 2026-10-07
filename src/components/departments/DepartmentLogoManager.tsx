import React, { useState } from "react";
import { AlertTriangle, CircleAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

interface DepartmentLogoManagerProps {
  initialLogoUrl: string | null;
}

function validateFile(file: File | null, requireSelection: boolean): string | null {
  if (!file) {
    return requireSelection ? "Wybierz obraz PNG, JPG lub SVG do przesłania" : null;
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return "Plik musi być obrazem PNG, JPG lub SVG";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Plik nie może być większy niż 2 MB";
  }

  return null;
}

export default function DepartmentLogoManager({ initialLogoUrl }: DepartmentLogoManagerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const errorMessage = fileError ?? requestError;
  const isBusy = isUploading || isRemoving;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setRequestError(null);
    setIsConfirmingRemove(false);

    if (!file) {
      setSelectedFile(null);
      setFileError(null);
      return;
    }

    const validationError = validateFile(file, false);
    if (validationError) {
      setSelectedFile(null);
      setFileError(validationError);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setFileError(null);
  }

  async function handleUpload(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setRequestError(null);
    setIsConfirmingRemove(false);

    const file = selectedFile;
    const validationError = validateFile(file, true);
    if (validationError || !file) {
      setFileError(validationError ?? "Wybierz obraz PNG, JPG lub SVG do przesłania");
      return;
    }

    setFileError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/departments/logo", {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        setRequestError("Nie udało się przesłać logo. Sprawdź plik i spróbuj ponownie.");
        setIsUploading(false);
        return;
      }

      window.location.assign("/employees");
    } catch {
      setRequestError("Nie udało się przesłać logo.");
      setIsUploading(false);
    }
  }

  function startRemoveConfirm() {
    setIsConfirmingRemove(true);
    setFileError(null);
    setRequestError(null);
  }

  function cancelRemoveConfirm() {
    setIsConfirmingRemove(false);
    setFileError(null);
    setRequestError(null);
  }

  async function handleRemove() {
    setFileError(null);
    setRequestError(null);
    setIsRemoving(true);

    try {
      const response = await fetch("/api/departments/logo", { method: "DELETE" });

      if (!response.ok) {
        setRequestError("Nie udało się usunąć logo. Spróbuj ponownie.");
        setIsRemoving(false);
        return;
      }

      window.location.assign("/employees");
    } catch {
      setRequestError("Nie udało się usunąć logo.");
      setIsRemoving(false);
    }
  }

  return (
    <section className="border-border bg-card mb-8 rounded-2xl border p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-foreground text-lg font-semibold">Logo działu</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Dodaj logo, które będzie używane w podpisach wszystkich osób z działu.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="border-border bg-muted overflow-hidden rounded-xl border">
          {initialLogoUrl ? (
            <img
              src={initialLogoUrl}
              alt="Aktualne logo działu"
              className="bg-muted h-40 w-full object-contain p-4"
            />
          ) : (
            <div className="text-muted-foreground flex h-40 items-center justify-center px-4 text-center text-sm">
              Nie dodano jeszcze logo
            </div>
          )}
        </div>

        <form onSubmit={handleUpload} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="department-logo" className="text-muted-foreground mb-1 block text-sm">
              Plik z logo
            </Label>
            <Input
              id="department-logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              disabled={isBusy}
              onChange={handleFileChange}
              aria-invalid={Boolean(fileError)}
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-yellow-300">
              <AlertTriangle className="size-3" />
              PNG, JPG lub SVG, maksymalnie 2 MB.
            </p>
          </div>

          {errorMessage ? (
            <p className="text-destructive flex items-center gap-2 text-sm">
              <CircleAlert className="size-4 shrink-0" />
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={isBusy}>
              {isUploading ? (
                "Przesyłanie..."
              ) : (
                <>
                  <Upload className="size-4" />
                  {initialLogoUrl ? "Zmień logo" : "Prześlij logo"}
                </>
              )}
            </Button>

            {initialLogoUrl ? (
              isConfirmingRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Czy na pewno usunąć logo?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRemove();
                    }}
                  >
                    {isRemoving ? "Usuwanie..." : "Tak, usuń"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={cancelRemoveConfirm}>
                    Anuluj
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" disabled={isBusy} onClick={startRemoveConfirm}>
                  <Trash2 className="size-4" />
                  Usuń logo
                </Button>
              )
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
