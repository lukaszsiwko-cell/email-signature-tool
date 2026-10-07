import type { EmployeeDTO } from "@/types";

import { fetchSeededDepartments, request, type HttpResponse } from "./http-client";

const TEST_PASSWORD = "Integration-Test-Passw0rd!";

export interface ProvisionedDepartmentUser {
  jar: string;
  employeeId: string;
}

export interface ProvisionedDepartmentUsers {
  departmentA: ProvisionedDepartmentUser;
  departmentB: ProvisionedDepartmentUser;
  cleanup(): Promise<void>;
}

interface DepartmentFixture {
  id: string;
  name: string;
}

interface SignupFixture {
  department: DepartmentFixture;
  email: string;
  jar: string;
}

function assertRedirect(response: HttpResponse, expectedLocationPrefix: string, action: string): void {
  if (response.status !== 302 || !response.location.startsWith(expectedLocationPrefix)) {
    throw new Error(
      `${action} failed: expected 302 redirect to ${expectedLocationPrefix}, received ${response.status} ${response.location}`,
    );
  }
}

async function signUpUser({ department, email, jar }: SignupFixture): Promise<void> {
  const response = await request("/api/auth/signup", {
    method: "POST",
    jar,
    form: {
      email,
      password: TEST_PASSWORD,
      departmentId: department.id,
    },
  });

  assertRedirect(response, "/auth/confirm-email", `Sign up for ${department.name}`);
}

async function signInUser({ department, email, jar }: SignupFixture): Promise<void> {
  const response = await request("/api/auth/signin", {
    method: "POST",
    jar,
    form: {
      email,
      password: TEST_PASSWORD,
    },
  });

  assertRedirect(response, "/", `Sign in for ${department.name}`);
}

async function createEmployee(jar: string, label: string, runId: string): Promise<EmployeeDTO> {
  const response = await request("/api/employees", {
    method: "POST",
    jar,
    json: {
      firstName: `${label} Employee`,
      lastName: `Isolation-${runId}`,
      email: `${label.toLowerCase()}-employee-${runId}@example.com`,
      position: `${label} QA`,
      phone: `+48 555 ${runId.slice(0, 3)} ${runId.slice(3, 6)}`,
    },
  });

  if (response.status !== 201) {
    throw new Error(
      `Creating employee for ${label} failed: expected 201, received ${response.status} ${response.body}`,
    );
  }

  return JSON.parse(response.body) as EmployeeDTO;
}

async function deleteEmployeeIfPresent(jar: string, employeeId: string): Promise<void> {
  const response = await request(`/api/employees/${employeeId}`, {
    method: "DELETE",
    jar,
  });

  if (response.status !== 204 && response.status !== 404) {
    throw new Error(`Cleaning up employee ${employeeId} failed: expected 204/404, received ${response.status}`);
  }
}

async function deleteLogoIfPresent(jar: string): Promise<void> {
  const response = await request("/api/departments/logo", {
    method: "DELETE",
    jar,
  });

  if (response.status !== 204) {
    throw new Error(`Cleaning up department logo failed: expected 204, received ${response.status} ${response.body}`);
  }
}

export async function provisionDepartmentUsers(): Promise<ProvisionedDepartmentUsers> {
  const departments = await fetchSeededDepartments();

  if (departments.length < 2) {
    throw new Error(
      `Integration tests need at least two seeded departments on /auth/signup, but found ${departments.length}.`,
    );
  }

  const [departmentA, departmentB] = departments;
  const runId = `${Date.now()}-${crypto.randomUUID()}`;
  const userA: SignupFixture = {
    department: departmentA,
    email: `integration-a-${runId}@example.com`,
    jar: `department-a-${runId}`,
  };
  const userB: SignupFixture = {
    department: departmentB,
    email: `integration-b-${runId}@example.com`,
    jar: `department-b-${runId}`,
  };

  await Promise.all([signUpUser(userA), signUpUser(userB)]);
  await Promise.all([signInUser(userA), signInUser(userB)]);

  const [employeeA, employeeB] = await Promise.all([
    createEmployee(userA.jar, departmentA.name, runId),
    createEmployee(userB.jar, departmentB.name, runId),
  ]);

  return {
    departmentA: {
      jar: userA.jar,
      employeeId: employeeA.id,
    },
    departmentB: {
      jar: userB.jar,
      employeeId: employeeB.id,
    },
    async cleanup() {
      await Promise.all([
        deleteLogoIfPresent(userA.jar),
        deleteLogoIfPresent(userB.jar),
        deleteEmployeeIfPresent(userA.jar, employeeA.id),
        deleteEmployeeIfPresent(userB.jar, employeeB.id),
      ]);
    },
  };
}
