import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { EmployeeDTO } from "@/types";

import { ensureBaseUrlReachable, request, type HttpResponse } from "./support/http-client";
import { provisionDepartmentUsers, type ProvisionedDepartmentUsers } from "./support/test-users";

const initialLogoPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+s9lsAAAAASUVORK5CYII=",
  "base64",
);
const replacementLogoSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#2563eb" /></svg>',
);

interface LogoResponse {
  logoUrl: string | null;
}

function objectPathFromSignedUrl(url: string): string {
  const [path = ""] = url.split("?");
  return path;
}

function requireProvisionedUsers(users: ProvisionedDepartmentUsers | null): ProvisionedDepartmentUsers {
  if (!users) {
    throw new Error("Expected test users to be provisioned before running assertions.");
  }

  return users;
}

function requireLogoUrl(response: LogoResponse): string {
  if (!response.logoUrl) {
    throw new Error("Expected department logo upload to return a signed logo URL.");
  }

  return response.logoUrl;
}

async function fetchBinaryAsBase64(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    status: response.status,
    body: bytes.toString("base64"),
  };
}

async function uploadLogo(jar: string, file: { name: string; type: string; data: Buffer }): Promise<HttpResponse> {
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array(file.data)], file.name, { type: file.type }));

  return request("/api/departments/logo", {
    method: "PUT",
    jar,
    multipart: formData,
  });
}

describe("cross-department employee and logo isolation", () => {
  let users: ProvisionedDepartmentUsers | null = null;

  beforeAll(async () => {
    await ensureBaseUrlReachable();
  });

  beforeEach(async () => {
    users = await provisionDepartmentUsers();
  });

  afterEach(async () => {
    if (users) {
      await users.cleanup();
      users = null;
    }
  });

  it("rejects department B attempts to list or mutate department A employee-scoped resources", async () => {
    const { departmentA, departmentB } = requireProvisionedUsers(users);

    const listResponse = await request("/api/employees", { jar: departmentB.jar });
    expect(listResponse.status).toBe(200);

    const employees = JSON.parse(listResponse.body) as EmployeeDTO[];
    expect(employees.some((employee) => employee.id === departmentA.employeeId)).toBe(false);
    expect(employees.some((employee) => employee.id === departmentB.employeeId)).toBe(true);

    const updateResponse = await request(`/api/employees/${departmentA.employeeId}`, {
      method: "PUT",
      jar: departmentB.jar,
      json: {
        firstName: "Tampered",
        lastName: "Employee",
        email: "tampered@example.com",
        position: "Intruder",
        phone: "+48 555 000 000",
      },
    });
    expect(updateResponse.status).toBe(404);

    const deleteResponse = await request(`/api/employees/${departmentA.employeeId}`, {
      method: "DELETE",
      jar: departmentB.jar,
    });
    expect(deleteResponse.status).toBe(404);

    const signatureResponse = await request(`/api/employees/${departmentA.employeeId}/signatures`, {
      method: "POST",
      jar: departmentB.jar,
    });
    expect(signatureResponse.status).toBe(404);

    const deliveryResponse = await request(`/api/employees/${departmentA.employeeId}/signature-deliveries`, {
      method: "POST",
      jar: departmentB.jar,
    });
    expect(deliveryResponse.status).toBe(404);
  });

  it("lets department B manage only its own logo while leaving department A logo untouched", async () => {
    const { departmentA, departmentB } = requireProvisionedUsers(users);

    const firstUpload = await uploadLogo(departmentA.jar, {
      name: "department-a-logo.png",
      type: "image/png",
      data: initialLogoPng,
    });
    expect(firstUpload.status).toBe(200);

    const firstLogo = JSON.parse(firstUpload.body) as LogoResponse;
    const firstLogoUrl = requireLogoUrl(firstLogo);
    const firstLogoBinary = await fetchBinaryAsBase64(firstLogoUrl);
    expect(firstLogoBinary.status).toBe(200);
    expect(firstLogoBinary.body).toBe(initialLogoPng.toString("base64"));

    const departmentBUpload = await uploadLogo(departmentB.jar, {
      name: "department-b-logo.svg",
      type: "image/svg+xml",
      data: replacementLogoSvg,
    });
    expect(departmentBUpload.status).toBe(200);

    const departmentBLogo = JSON.parse(departmentBUpload.body) as LogoResponse;
    const departmentBLogoUrl = requireLogoUrl(departmentBLogo);
    const departmentBLogoBinary = await fetchBinaryAsBase64(departmentBLogoUrl);
    expect(departmentBLogoBinary.status).toBe(200);
    expect(departmentBLogoBinary.body).toBe(replacementLogoSvg.toString("base64"));
    expect(objectPathFromSignedUrl(departmentBLogoUrl)).not.toBe(objectPathFromSignedUrl(firstLogoUrl));

    const departmentBDelete = await request("/api/departments/logo", {
      method: "DELETE",
      jar: departmentB.jar,
    });
    expect(departmentBDelete.status).toBe(204);

    const secondUpload = await uploadLogo(departmentA.jar, {
      name: "department-a-logo.png",
      type: "image/png",
      data: initialLogoPng,
    });
    expect(secondUpload.status).toBe(200);

    const secondLogo = JSON.parse(secondUpload.body) as LogoResponse;
    const secondLogoUrl = requireLogoUrl(secondLogo);
    const secondLogoBinary = await fetchBinaryAsBase64(secondLogoUrl);
    expect(secondLogoBinary.status).toBe(200);
    expect(secondLogoBinary.body).toBe(initialLogoPng.toString("base64"));
    expect(objectPathFromSignedUrl(secondLogoUrl)).toBe(objectPathFromSignedUrl(firstLogoUrl));
  });
});
