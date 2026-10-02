// Shared entity/DTO types for API boundaries. Keep camelCase here; map to/from
// snake_case DB columns inside the service layer (see src/lib/services/).

export interface EmployeeDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  position: string;
  phone: string;
  createdAt: string;
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email?: string;
  position: string;
  phone: string;
}

export interface UpdateEmployeeInput extends Omit<CreateEmployeeInput, "email"> {
  email?: string | null;
}

export interface SignatureArtifactsDTO {
  outlookHtml: string;
  thunderbirdInstaller: string;
  thunderbirdLauncher: string;
}
