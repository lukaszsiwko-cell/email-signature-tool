import { describe, expect, it } from "vitest";

import type { EmployeeDTO } from "@/types";

describe("Vitest bootstrap", () => {
  it("resolves the src alias and runs unit tests", () => {
    const exampleEmployee: EmployeeDTO = {
      id: "employee-1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      position: "Engineer",
      phone: "+48-123-456-789",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expect(exampleEmployee.firstName).toBe("Ada");
    expect(1 + 1).toBe(2);
  });
});
