import React, { useState } from "react";
import { CircleAlert, Lock, Mail, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 6;
const selectBase =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 transition-colors";

interface DepartmentOption {
  id: string;
  name: string;
}

interface Props {
  serverError?: string | null;
  departments: DepartmentOption[];
}

export default function SignUpForm({ serverError, departments }: Props) {
  const [departmentId, setDepartmentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    departmentId?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};

    if (!departmentId) {
      next.departmentId = "Wybierz dział";
    }

    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Wpisz prawidłowy adres e-mail";
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const remainingCharacters = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && remainingCharacters > 0 ? (
      <p className="mt-1 text-xs text-blue-100/50">
        Dodaj jeszcze {remainingCharacters} {remainingCharacters === 1 ? "znak" : remainingCharacters < 5 ? "znaki" : "znaków"}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="departmentId" className="mb-1 block text-sm text-blue-100/80">
          Dział
        </label>
        <select
          id="departmentId"
          name="departmentId"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            clearError("departmentId");
          }}
          className={cn(
            selectBase,
            departmentId ? "text-white" : "text-white/40",
            errors.departmentId ? "border-red-400/60 focus:ring-red-400" : "focus:ring-primary border-white/20",
          )}
        >
          <option value="" disabled className="bg-slate-900 text-white">
            Wybierz dział
          </option>
          {departments.map((department) => (
            <option key={department.id} value={department.id} className="bg-slate-900 text-white">
              {department.name}
            </option>
          ))}
        </select>
        {errors.departmentId ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.departmentId}
          </p>
        ) : null}
      </div>

      <FormField
        id="email"
        type="email"
        label="Adres e-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="imie@firma.pl"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Minimum 6 znaków"
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło ponownie"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Tworzenie konta..." icon={<UserPlus className="size-4" />}>
        Utwórz konto
      </SubmitButton>
    </form>
  );
}
