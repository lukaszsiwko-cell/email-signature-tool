import { useState } from "react";
import { AlertTriangle, CircleAlert, Download, LoaderCircle, Mail, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EmployeeDTO, SignatureArtifactsDTO } from "@/types";

// Optional field — per the PRD's warn, never block rule, an invalid shape
// only shows a hint and never prevents saving. "Valid" means 9 digits once
// separators/parens/+ are stripped, with an optional leading Polish country
// code (48) tolerated and discarded before counting.
function phoneLooksValid(value: string): boolean {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("48")) {
    digits = digits.slice(2);
  }
  return digits.length === 9;
}

function sanitizeFilename(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\p{Cc}/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .slice(0, 80);
}

function downloadArtifact(contents: string, contentType: string, filename: string) {
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

interface Draft {
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  phone: string;
}

interface DraftErrors {
  firstName?: string;
  lastName?: string;
  position?: string;
}

interface EmployeeTableProps {
  employees: EmployeeDTO[];
  emailDeliveryEnabled: boolean;
}

interface DeliveryMessage {
  kind: "success" | "error";
  text: string;
}

export default function EmployeeTable({ employees, emailDeliveryEnabled }: EmployeeTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ firstName: "", lastName: "", email: "", position: "", phone: "" });
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingEmployeeId, setGeneratingEmployeeId] = useState<string | null>(null);
  const [signatureErrors, setSignatureErrors] = useState<Record<string, string>>({});
  const [sendingEmployeeId, setSendingEmployeeId] = useState<string | null>(null);
  const [deliveryMessages, setDeliveryMessages] = useState<Record<string, DeliveryMessage>>({});

  function startEdit(employee: EmployeeDTO) {
    setEditingId(employee.id);
    setDraft({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? "",
      position: employee.position,
      phone: employee.phone,
    });
    setDraftErrors({});
    setRowError(null);
    setConfirmingDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftErrors({});
    setRowError(null);
  }

  function clearDraftError(field: keyof DraftErrors) {
    if (draftErrors[field]) setDraftErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateDraft(): boolean {
    const next: DraftErrors = {};
    if (!draft.firstName.trim()) next.firstName = "First name is required";
    if (!draft.lastName.trim()) next.lastName = "Last name is required";
    if (!draft.position.trim()) next.position = "Position is required";
    setDraftErrors(next);
    return Object.keys(next).length === 0;
  }

  async function saveEdit(id: string) {
    setRowError(null);
    if (!validateDraft()) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setRowError(body?.error ?? "Failed to save changes");
        setIsSaving(false);
        return;
      }

      // Full-page navigation so the server-rendered list picks up the change.
      window.location.assign("/employees");
    } catch {
      setRowError("Failed to save changes");
      setIsSaving(false);
    }
  }

  function startDeleteConfirm(id: string) {
    setConfirmingDeleteId(id);
    setRowError(null);
    setEditingId(null);
  }

  function cancelDeleteConfirm() {
    setConfirmingDeleteId(null);
    setRowError(null);
  }

  async function confirmDelete(id: string) {
    setRowError(null);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/employees/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setRowError(body?.error ?? "Failed to delete employee");
        setIsDeleting(false);
        return;
      }

      window.location.assign("/employees");
    } catch {
      setRowError("Failed to delete employee");
      setIsDeleting(false);
    }
  }

  async function generateSignatures(employee: EmployeeDTO) {
    if (generatingEmployeeId !== null) return;

    setGeneratingEmployeeId(employee.id);
    setSignatureErrors((current) => {
      return Object.fromEntries(Object.entries(current).filter(([id]) => id !== employee.id));
    });

    try {
      const response = await fetch(`/api/employees/${employee.id}/signatures`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (!response.ok) {
        setSignatureErrors((current) => ({
          ...current,
          [employee.id]: typeof body?.error === "string" ? body.error : "Failed to generate signatures",
        }));
        return;
      }

      if (
        typeof body?.outlookHtml !== "string" ||
        typeof body.thunderbirdInstaller !== "string" ||
        typeof body.thunderbirdLauncher !== "string"
      ) {
        setSignatureErrors((current) => ({ ...current, [employee.id]: "Invalid signature response" }));
        return;
      }

      const artifacts = body as unknown as SignatureArtifactsDTO;
      const filenameBase =
        sanitizeFilename(`${employee.firstName}-${employee.lastName}`) || `employee-${employee.id.slice(0, 8)}`;

      downloadArtifact(artifacts.outlookHtml, "text/html;charset=utf-8", `${filenameBase}-new-outlook.html`);
      downloadArtifact(
        artifacts.thunderbirdInstaller,
        "text/plain;charset=utf-8",
        `${filenameBase}-thunderbird-installer.ps1`,
      );
      downloadArtifact(
        artifacts.thunderbirdLauncher,
        "text/plain;charset=utf-8",
        `${filenameBase}-thunderbird-installer.cmd`,
      );
    } catch {
      setSignatureErrors((current) => ({ ...current, [employee.id]: "Failed to generate signatures" }));
    } finally {
      setGeneratingEmployeeId(null);
    }
  }

  async function sendSignatures(employee: EmployeeDTO) {
    if (!employee.email || sendingEmployeeId !== null) return;

    setSendingEmployeeId(employee.id);
    setDeliveryMessages((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== employee.id)));
    try {
      const response = await fetch(`/api/employees/${employee.id}/send-signatures`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setDeliveryMessages((current) => ({
          ...current,
          [employee.id]: { kind: "error", text: body?.error ?? "Failed to send signature email" },
        }));
        return;
      }

      setDeliveryMessages((current) => ({
        ...current,
        [employee.id]: { kind: "success", text: "Signature files sent." },
      }));
    } catch {
      setDeliveryMessages((current) => ({
        ...current,
        [employee.id]: { kind: "error", text: "Failed to send signature email" },
      }));
    } finally {
      setSendingEmployeeId(null);
    }
  }

  const phoneHint =
    editingId && draft.phone.trim().length > 0 && !phoneLooksValid(draft.phone) ? (
      <p className="mt-1 flex items-center gap-1 text-xs text-yellow-300">
        <AlertTriangle className="size-3" />
        This doesn&apos;t look like a valid phone number (9 digits), but you can still save.
      </p>
    ) : undefined;

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          <TableHead className="text-muted-foreground">First name</TableHead>
          <TableHead className="text-muted-foreground">Last name</TableHead>
          <TableHead className="text-muted-foreground">Email</TableHead>
          <TableHead className="text-muted-foreground">Position</TableHead>
          <TableHead className="text-muted-foreground">Phone</TableHead>
          <TableHead className="text-muted-foreground">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((employee) => {
          const isEditing = editingId === employee.id;
          const isConfirmingDelete = confirmingDeleteId === employee.id;

          return (
            <TableRow key={employee.id} className="border-border hover:bg-accent/50">
              {isEditing ? (
                <>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={draft.firstName}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, firstName: e.target.value }));
                        clearDraftError("firstName");
                      }}
                      aria-invalid={Boolean(draftErrors.firstName)}
                    />
                    {draftErrors.firstName ? (
                      <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                        <CircleAlert className="size-3" />
                        {draftErrors.firstName}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={draft.lastName}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, lastName: e.target.value }));
                        clearDraftError("lastName");
                      }}
                      aria-invalid={Boolean(draftErrors.lastName)}
                    />
                    {draftErrors.lastName ? (
                      <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                        <CircleAlert className="size-3" />
                        {draftErrors.lastName}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      type="email"
                      value={draft.email}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, email: e.target.value }));
                      }}
                      aria-label="Employee email"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={draft.position}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, position: e.target.value }));
                        clearDraftError("position");
                      }}
                      aria-invalid={Boolean(draftErrors.position)}
                    />
                    {draftErrors.position ? (
                      <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                        <CircleAlert className="size-3" />
                        {draftErrors.position}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={draft.phone}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, phone: e.target.value }));
                      }}
                    />
                    {phoneHint}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => {
                            void saveEdit(employee.id);
                          }}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                      {rowError ? <p className="text-destructive text-xs">{rowError}</p> : null}
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{employee.firstName}</TableCell>
                  <TableCell>{employee.lastName}</TableCell>
                  <TableCell>{employee.email ?? "—"}</TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell>{employee.phone}</TableCell>
                  <TableCell>
                    {isConfirmingDelete ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">Are you sure?</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={() => {
                              void confirmDelete(employee.id);
                            }}
                          >
                            {isDeleting ? "Deleting..." : "Yes"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isDeleting}
                            onClick={cancelDeleteConfirm}
                          >
                            No
                          </Button>
                        </div>
                        {rowError ? <p className="text-destructive text-xs">{rowError}</p> : null}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={generatingEmployeeId !== null || sendingEmployeeId !== null}
                            onClick={() => {
                              void generateSignatures(employee);
                            }}
                          >
                            {generatingEmployeeId === employee.id ? (
                              <>
                                <LoaderCircle className="size-3.5 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Download className="size-3.5" />
                                Generate signatures
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              !employee.email ||
                              !emailDeliveryEnabled ||
                              sendingEmployeeId !== null ||
                              generatingEmployeeId !== null
                            }
                            onClick={() => {
                              void sendSignatures(employee);
                            }}
                            title={
                              !employee.email
                                ? "Add an email address to enable sending."
                                : !emailDeliveryEnabled
                                  ? "Email delivery is not configured."
                                  : undefined
                            }
                          >
                            {sendingEmployeeId === employee.id ? (
                              <>
                                <LoaderCircle className="size-3.5 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="size-3.5" />
                                Email signatures
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              startEdit(employee);
                            }}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              startDeleteConfirm(employee.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                        {signatureErrors[employee.id] ? (
                          <p className="text-destructive text-xs">{signatureErrors[employee.id]}</p>
                        ) : null}
                        {!employee.email ? (
                          <p className="text-muted-foreground text-xs">Email is optional; add one if you want to send the files.</p>
                        ) : !emailDeliveryEnabled ? (
                          <p className="text-muted-foreground text-xs">
                            Email relay is not configured. Use Generate signatures to download files.
                          </p>
                        ) : null}
                        {deliveryMessages[employee.id] ? (
                          <p
                            className={
                              deliveryMessages[employee.id].kind === "error"
                                ? "text-destructive text-xs"
                                : "text-muted-foreground text-xs"
                            }
                            role={deliveryMessages[employee.id].kind === "error" ? "alert" : "status"}
                          >
                            {deliveryMessages[employee.id].text}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
