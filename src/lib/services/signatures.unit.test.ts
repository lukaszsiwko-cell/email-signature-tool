import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  it("prefixes the UTF-8 installer with a BOM for Windows PowerShell 5.1", () => {
    const artifacts = generateSignatureArtifacts(baseEmployee, null);
    const installerBytes = new TextEncoder().encode(artifacts.thunderbirdInstaller);

    expect(Array.from(installerBytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("encodes the launcher command as UTF-16LE while keeping the batch file ASCII", () => {
    const { thunderbirdLauncher } = generateSignatureArtifacts(baseEmployee, null);
    const match = /-EncodedCommand ([A-Za-z0-9+/=]+)/.exec(thunderbirdLauncher);
    expect(match).not.toBeNull();
    if (!match) throw new Error("Launcher is missing an encoded PowerShell command.");

    const command = Buffer.from(match[1], "base64").toString("utf16le");
    expect(command).toContain("Umieść oba pobrane pliki (.cmd i .ps1) w tym samym folderze.");
    expect(command).toContain("Muszą mieć identyczne nazwy przed rozszerzeniem.");
    expect(command).toContain("$installer = $env:THUNDERBIRD_INSTALLER");
    expect(command).toContain("Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned");
    expect(command).toContain("'MachinePolicy', 'UserPolicy'");
    expect(thunderbirdLauncher).toContain('set "THUNDERBIRD_INSTALLER=%~dpn0.ps1"');
    expect(Array.from(thunderbirdLauncher).every((character) => character.charCodeAt(0) < 128)).toBe(true);
    expect(thunderbirdLauncher.split("\r\n").every((line) => line.length < 8191)).toBe(true);
  });

  it.skipIf(process.platform !== "win32").each(["instalator-thunderbird", "Ada-Lovelace-thunderbird-installer"])(
    "runs the matching installer from the %s launcher on Windows",
    (filenameBase) => {
      const directory = mkdtempSync(join(tmpdir(), "thunderbird-launcher-Łukasz test-"));
      const launcherPath = join(directory, `${filenameBase}.cmd`);
      const installerPath = join(directory, `${filenameBase}.ps1`);
      const markerPath = join(directory, "executed-installer.txt");

      try {
        writeFileSync(launcherPath, generateSignatureArtifacts(baseEmployee, null).thunderbirdLauncher, "utf8");
        writeFileSync(installerPath, "[System.IO.File]::WriteAllText($env:TEST_MARKER_PATH, $PSCommandPath)", "utf8");

        execFileSync(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", ["/d", "/c", launcherPath], {
          env: { ...process.env, TEST_MARKER_PATH: markerPath },
          input: "\r\n",
          stdio: "pipe",
          timeout: 15000,
        });

        expect(realpathSync.native(readFileSync(markerPath, "utf8"))).toBe(realpathSync.native(installerPath));
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform !== "win32")("reports a missing installer in Polish and exits with an error", () => {
    const directory = mkdtempSync(join(tmpdir(), "thunderbird-missing-installer-"));
    const launcherPath = join(directory, "instalator-thunderbird.cmd");

    try {
      writeFileSync(launcherPath, generateSignatureArtifacts(baseEmployee, null).thunderbirdLauncher, "utf8");
      const result = spawnSync(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", ["/d", "/c", launcherPath], {
        input: "\r\n",
        encoding: "utf8",
        timeout: 15000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Umieść oba pobrane pliki (.cmd i .ps1) w tym samym folderze.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "win32")("parses the installer in Windows PowerShell without executing it", () => {
    const directory = mkdtempSync(join(tmpdir(), "thunderbird-installer-"));
    const installerPath = join(directory, "installer.ps1");

    try {
      const artifacts = generateSignatureArtifacts(baseEmployee, null);
      writeFileSync(installerPath, artifacts.thunderbirdInstaller, "utf8");

      expect(() =>
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$tokens = $null; $parseErrors = $null; [System.Management.Automation.Language.Parser]::ParseFile($env:TEST_INSTALLER_PATH, [ref]$tokens, [ref]$parseErrors) | Out-Null; if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
          ],
          { env: { ...process.env, TEST_INSTALLER_PATH: installerPath }, stdio: "pipe" },
        ),
      ).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

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
