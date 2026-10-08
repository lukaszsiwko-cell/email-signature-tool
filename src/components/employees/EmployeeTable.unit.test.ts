import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EmployeeTable from "./EmployeeTable";
import type { EmployeeDTO } from "@/types";

const employee: EmployeeDTO = {
  id: "employee-test",
  firstName: "Anna",
  lastName: "Kowalska",
  email: "anna@example.test",
  position: "Specjalista",
  phone: "500100200",
  createdAt: "2026-10-08T00:00:00Z",
};

describe("EmployeeTable actions", () => {
  it.each(["Generuj podpisy", "Wyślij podpisy", "Edytuj", "Usuń"])("renders the accessible action %s", (label) => {
    const markup = renderToStaticMarkup(
      createElement(EmployeeTable, { employees: [employee], emailDeliveryEnabled: true }),
    );
    expect(markup).toContain(`aria-label="${label}"`);
  });

  it("gives generation its own tooltip without showing delete confirmation initially", () => {
    const markup = renderToStaticMarkup(
      createElement(EmployeeTable, { employees: [employee], emailDeliveryEnabled: true }),
    );
    expect(markup).toContain('title="Generuj podpisy"');
    expect(markup).not.toContain("Tak, usuń");
  });
});
