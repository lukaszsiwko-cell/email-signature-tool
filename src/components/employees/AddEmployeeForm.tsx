import React, { useState } from "react";
import { AlertTriangle, CircleAlert, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Loose "does this look like a phone number" check — per the PRD's warn, never
// block rule, a non-match only shows a hint and never prevents submission.
const PHONE_LOOKS_VALID = /^[+\d][\d\s()-]{5,}$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  position?: string;
}

const fieldClass = (hasError: boolean) =>
  cn(
    "border bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400",
    hasError ? "border-red-400/60 focus-visible:ring-red-400" : "border-white/20",
  );

export default function AddEmployeeForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!firstName.trim()) next.firstName = "First name is required";
    if (!lastName.trim()) next.lastName = "Last name is required";
    if (!position.trim()) next.position = "Position is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof FormErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, position, phone }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setServerError(body?.error ?? "Failed to add employee");
        setIsSubmitting(false);
        return;
      }

      // Full-page navigation so the server-rendered list picks up the new employee.
      window.location.href = "/employees";
    } catch {
      setServerError("Failed to add employee");
      setIsSubmitting(false);
    }
  }

  const phoneHint =
    phone.trim().length > 0 && !PHONE_LOOKS_VALID.test(phone) ? (
      <p className="mt-1 flex items-center gap-1 text-xs text-yellow-300">
        <AlertTriangle className="size-3" />
        This doesn&apos;t look like a valid phone number, but you can still submit.
      </p>
    ) : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName" className="mb-1 block text-sm text-blue-100/80">
            First name
          </Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              clearError("firstName");
            }}
            className={fieldClass(Boolean(errors.firstName))}
          />
          {errors.firstName ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
              <CircleAlert className="size-3" />
              {errors.firstName}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="lastName" className="mb-1 block text-sm text-blue-100/80">
            Last name
          </Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              clearError("lastName");
            }}
            className={fieldClass(Boolean(errors.lastName))}
          />
          {errors.lastName ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
              <CircleAlert className="size-3" />
              {errors.lastName}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="position" className="mb-1 block text-sm text-blue-100/80">
          Position
        </Label>
        <Input
          id="position"
          value={position}
          onChange={(e) => {
            setPosition(e.target.value);
            clearError("position");
          }}
          className={fieldClass(Boolean(errors.position))}
        />
        {errors.position ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.position}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="phone" className="mb-1 block text-sm text-blue-100/80">
          Phone
        </Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
          className={fieldClass(false)}
        />
        {phoneHint}
      </div>

      <ServerError message={serverError} />

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Adding...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Add employee
          </span>
        )}
      </Button>
    </form>
  );
}
