import { useState } from "react";
import { AlertTriangle, CircleAlert, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EmployeeDTO } from "@/types";

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

interface Draft {
  firstName: string;
  lastName: string;
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
}

export default function EmployeeTable({ employees }: EmployeeTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ firstName: "", lastName: "", position: "", phone: "" });
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function startEdit(employee: EmployeeDTO) {
    setEditingId(employee.id);
    setDraft({
      firstName: employee.firstName,
      lastName: employee.lastName,
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
                      <div className="flex gap-2">
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
