import { describe, expect, it } from "vitest";

import type { DepartmentLogoAsset } from "./departments";
import { generateSignatureArtifacts } from "./signatures";
import type { EmployeeDTO } from "../../types";

const installerBase64Pattern = /\[System\.Convert\]::FromBase64String\('([^']+)'\)/;

const baseEmployee: EmployeeDTO = {
  id: "employee-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  position: "Engineer",
  phone: "+48 123 456 789",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const logoFixture: DepartmentLogoAsset = {
  data: Uint8Array.from([1, 2, 3]),
  contentType: "image/png",
};

const adversarialFixtures = [
  {
    label: "script-tag payload",
    value: "Smoke <script>alert(1)</script>",
    expectedHtml: "Smoke &lt;script&gt;alert(1)&lt;/script&gt;",
    rawHtmlShouldBeAbsent: true,
  },
  {
    label: "ampersand payload",
    value: "Tester & Support",
    expectedHtml: "Tester &amp; Support",
    rawHtmlShouldBeAbsent: true,
  },
  {
    label: "double-quote payload",
    value: 'Quoted "Value"',
    expectedHtml: "Quoted &quot;Value&quot;",
    rawHtmlShouldBeAbsent: true,
  },
  {
    label: "backtick payload",
    value: "Backtick `Value`",
    expectedHtml: "Backtick `Value`",
    rawHtmlShouldBeAbsent: false,
  },
  {
    label: "subexpression payload",
    value: "Ops $() Team",
    expectedHtml: "Ops $() Team",
    rawHtmlShouldBeAbsent: false,
  },
] as const;

const employeeFields = ["firstName", "lastName", "position", "phone"] as const;

type TestedEmployeeField = (typeof employeeFields)[number];

function decodeInstallerPayload(thunderbirdInstaller: string) {
  const match = installerBase64Pattern.exec(thunderbirdInstaller);
  expect(match, "expected Thunderbird installer to contain a Base64-encoded HTML blob").not.toBeNull();
  if (!match) {
    throw new Error("Thunderbird installer is missing the expected Base64-encoded HTML blob.");
  }

  const [blobExpression, htmlBase64] = match;
  const installerWithoutBlob = thunderbirdInstaller.replace(
    blobExpression,
    "[System.Convert]::FromBase64String('<signature-html>')",
  );

  return {
    decodedHtml: Buffer.from(htmlBase64, "base64").toString("utf8"),
    installerWithoutBlob,
  };
}

function createEmployeeWithField(field: TestedEmployeeField, value: string): EmployeeDTO {
  return {
    ...baseEmployee,
    [field]: value,
  };
}

describe("generateSignatureArtifacts", () => {
  it("omits the logo markup for a clean fixture when logo is null", () => {
    const artifacts = generateSignatureArtifacts(baseEmployee, null);
    const { decodedHtml, installerWithoutBlob } = decodeInstallerPayload(artifacts.thunderbirdInstaller);

    expect(artifacts.outlookHtml).toContain("Ada Lovelace");
    expect(artifacts.outlookHtml).toContain("<title>Podpis e-mail</title>");
    expect(artifacts.outlookHtml).toContain("Engineer");
    expect(artifacts.outlookHtml).toContain("+48 123 456 789");
    expect(artifacts.outlookHtml).not.toContain("<img");
    expect(decodedHtml).toBe(artifacts.outlookHtml);
    expect(artifacts.thunderbirdInstaller).toContain("Wybierz profil Thunderbirda:");
    expect(artifacts.thunderbirdInstaller).not.toContain("Choose a Thunderbird profile:");
    expect(installerWithoutBlob).not.toContain(baseEmployee.firstName);
    expect(installerWithoutBlob).not.toContain(baseEmployee.lastName);
    expect(installerWithoutBlob).not.toContain(baseEmployee.position);
    expect(installerWithoutBlob).not.toContain(baseEmployee.phone);
  });

  it("embeds an allowed department logo as a data URI when provided", () => {
    const artifacts = generateSignatureArtifacts(baseEmployee, logoFixture);

    expect(artifacts.outlookHtml).toContain("data:image/png;base64,AQID");
    expect(artifacts.outlookHtml).toContain('alt="Logo firmy"');
  });

  it.each(employeeFields.flatMap((field) => adversarialFixtures.map((fixture) => [field, fixture] as const)))(
    "escapes %s for the %s fixture and keeps it out of raw PowerShell source",
    (field, fixture) => {
      const employee = createEmployeeWithField(field, fixture.value);
      const artifacts = generateSignatureArtifacts(employee, null);
      const { decodedHtml, installerWithoutBlob } = decodeInstallerPayload(artifacts.thunderbirdInstaller);

      expect(artifacts.outlookHtml, `${field} should render the ${fixture.label} in the expected HTML form`).toContain(
        fixture.expectedHtml,
      );

      if (fixture.rawHtmlShouldBeAbsent) {
        expect(
          artifacts.outlookHtml,
          `${field} should not render the raw ${fixture.label} directly in HTML`,
        ).not.toContain(fixture.value);
      }

      expect(decodedHtml, `${field} should produce the same escaped HTML in the Thunderbird installer blob`).toBe(
        artifacts.outlookHtml,
      );

      expect(
        installerWithoutBlob,
        `${field} should not leak the raw ${fixture.label} into literal PowerShell source`,
      ).not.toContain(fixture.value);
    },
  );
});
