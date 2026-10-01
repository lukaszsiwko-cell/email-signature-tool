import React, { useState } from "react";
import { AlertTriangle, CircleAlert, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";

// Optional field — per the PRD's warn, never block rule, an invalid shape
// only shows a hint and never prevents submission. "Valid" means 9 digits
// once separators/parens/+ are stripped, with an optional leading Polish
// country code (48) tolerated and discarded before counting.
function phoneLooksValid(value: string): boolean {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("48")) {
    digits = digits.slice(2);
  }
  return digits.length === 9;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  position?: string;
}

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
    phone.trim().length > 0 && !phoneLooksValid(phone) ? (
      <p className="mt-1 flex items-center gap-1 text-xs text-yellow-300">
        <AlertTriangle className="size-3" />
        This doesn&apos;t look like a valid phone number (9 digits), but you can still submit.
      </p>
    ) : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName" className="text-muted-foreground mb-1 block text-sm">
            First name
          </Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              clearError("firstName");
            }}
            aria-invalid={Boolean(errors.firstName)}
          />
          {errors.firstName ? (
            <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
              <CircleAlert className="size-3" />
              {errors.firstName}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="lastName" className="text-muted-foreground mb-1 block text-sm">
            Last name
          </Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              clearError("lastName");
            }}
            aria-invalid={Boolean(errors.lastName)}
          />
          {errors.lastName ? (
            <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
              <CircleAlert className="size-3" />
              {errors.lastName}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="position" className="text-muted-foreground mb-1 block text-sm">
          Position
        </Label>
        <Input
          id="position"
          value={position}
          onChange={(e) => {
            setPosition(e.target.value);
            clearError("position");
          }}
          aria-invalid={Boolean(errors.position)}
        />
        {errors.position ? (
          <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
            <CircleAlert className="size-3" />
            {errors.position}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="phone" className="text-muted-foreground mb-1 block text-sm">
          Phone
        </Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
        {phoneHint}
      </div>

      <ServerError message={serverError} />

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
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
