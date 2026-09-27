import React, { useState } from "react";
import { AlertTriangle, CircleAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

interface DepartmentLogoManagerProps {
  initialLogoUrl: string | null;
}

const fieldClass = (hasError: boolean) =>
  cn(
    "border bg-white/10 text-white file:text-white focus-visible:ring-purple-400",
    hasError ? "border-red-400/60 focus-visible:ring-red-400" : "border-white/20",
  );

function validateFile(file: File | null, requireSelection: boolean): string | null {
  if (!file) {
    return requireSelection ? "Select a PNG, JPG, or SVG image to upload" : null;
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return "File must be a PNG, JPG, or SVG image";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File must be 2MB or smaller";
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
      setFileError(validationError ?? "Select a PNG, JPG, or SVG image to upload");
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
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setRequestError(body?.error ?? "Failed to upload logo");
        setIsUploading(false);
        return;
      }

      window.location.assign("/employees");
    } catch {
      setRequestError("Failed to upload logo");
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
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setRequestError(body?.error ?? "Failed to remove logo");
        setIsRemoving(false);
        return;
      }

      window.location.assign("/employees");
    } catch {
      setRequestError("Failed to remove logo");
      setIsRemoving(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Department logo</h2>
        <p className="mt-1 text-sm text-blue-100/70">
          Upload the image used across signatures for everyone in your department.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/10">
          {initialLogoUrl ? (
            <img
              src={initialLogoUrl}
              alt="Current department logo"
              className="h-40 w-full bg-white/5 object-contain p-4"
            />
          ) : (
            <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-blue-100/70">
              No logo set
            </div>
          )}
        </div>

        <form onSubmit={handleUpload} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="department-logo" className="mb-1 block text-sm text-blue-100/80">
              Logo file
            </Label>
            <Input
              id="department-logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              disabled={isBusy}
              onChange={handleFileChange}
              className={fieldClass(Boolean(fileError))}
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-yellow-300">
              <AlertTriangle className="size-3" />
              PNG, JPG, or SVG up to 2MB.
            </p>
          </div>

          {errorMessage ? (
            <p className="flex items-center gap-2 text-sm text-red-300">
              <CircleAlert className="size-4 shrink-0" />
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={isBusy} className="bg-purple-600 text-white hover:bg-purple-500">
              {isUploading ? (
                "Uploading..."
              ) : (
                <>
                  <Upload className="size-4" />
                  {initialLogoUrl ? "Replace logo" : "Upload"}
                </>
              )}
            </Button>

            {initialLogoUrl ? (
              isConfirmingRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-100/80">Are you sure?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRemove();
                    }}
                  >
                    {isRemoving ? "Removing..." : "Yes"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={cancelRemoveConfirm}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={startRemoveConfirm}
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                >
                  <Trash2 className="size-4" />
                  Remove logo
                </Button>
              )
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
