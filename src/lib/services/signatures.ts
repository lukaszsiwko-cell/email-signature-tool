import type { EmployeeDTO } from "@/types";
import type { DepartmentLogoAsset } from "@/lib/services/departments";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

export interface SignatureArtifacts {
  outlookHtml: string;
  thunderbirdInstaller: string;
  thunderbirdLauncher: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function createHtml(employee: EmployeeDTO, logo: DepartmentLogoAsset | null): string {
  const displayName = `${employee.firstName} ${employee.lastName}`.trim();
  const logoHtml = logo
    ? `<tr><td style="padding:0 0 12px"><img src="data:${logo.contentType};base64,${encodeBase64(logo.data)}" alt="Logo firmy" style="display:block;max-width:180px;max-height:64px;width:auto;height:auto"></td></tr>`
    : "";
  const phoneHtml = employee.phone
    ? `<tr><td style="padding:0;color:#555;font:14px Arial,sans-serif">${escapeHtml(employee.phone)}</td></tr>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Podpis e-mail</title></head><body><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif"><tbody>${logoHtml}<tr><td style="padding:0 0 4px;color:#222;font-size:16px;font-weight:bold">${escapeHtml(displayName)}</td></tr><tr><td style="padding:0 0 4px;color:#555;font-size:14px">${escapeHtml(employee.position)}</td></tr>${phoneHtml}</tbody></table></body></html>`;
}

function createThunderbirdInstaller(signatureHtml: string): string {
  const signatureHtmlBase64 = encodeBase64(new TextEncoder().encode(signatureHtml));

  return "\uFEFF" + String.raw`$ErrorActionPreference = 'Stop'
$signatureHtml = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${signatureHtmlBase64}'))
while (Get-Process -Name 'thunderbird' -ErrorAction SilentlyContinue) {
  Write-Host 'Zapisz swoją pracę i zamknij Thunderbirda przed kontynuowaniem.'
  Read-Host 'Naciśnij Enter, aby sprawdzić ponownie, lub Ctrl+C, aby anulować' | Out-Null
}

$thunderbirdRoot = Join-Path $env:APPDATA 'Thunderbird'
$profilesIni = Join-Path $thunderbirdRoot 'profiles.ini'
if (-not (Test-Path -LiteralPath $profilesIni -PathType Leaf)) { throw 'Nie znaleziono pliku profiles.ini Thunderbirda.' }

$sections = @{}
$currentSection = $null
foreach ($line in [System.IO.File]::ReadAllLines($profilesIni)) {
  if ($line -match '^\s*\[([^\]]+)\]\s*$') {
    $currentSection = $Matches[1]
    $sections[$currentSection] = @{}
  } elseif ($currentSection -and $line -match '^\s*([^=]+?)\s*=\s*(.*?)\s*$') {
    $sections[$currentSection][$Matches[1]] = $Matches[2]
  }
}

$profiles = @()
foreach ($sectionName in $sections.Keys) {
  if ($sectionName -notmatch '^Profile\d+$') { continue }
  $section = $sections[$sectionName]
  if (-not $section.ContainsKey('Path')) { continue }
  if ($section['IsRelative'] -eq '1') {
    $profilePath = [System.IO.Path]::GetFullPath((Join-Path $thunderbirdRoot $section['Path']))
  } else {
    $profilePath = [System.IO.Path]::GetFullPath($section['Path'])
  }
  if (Test-Path -LiteralPath (Join-Path $profilePath 'prefs.js') -PathType Leaf) {
    $profiles += [PSCustomObject]@{ Name = $section['Name']; Path = $profilePath; Default = ($section['Default'] -eq '1') }
  }
}
if ($profiles.Count -eq 0) { throw 'Nie znaleziono profilu Thunderbirda z plikiem prefs.js.' }

Write-Host 'Wybierz profil Thunderbirda:'
for ($index = 0; $index -lt $profiles.Count; $index++) {
  $label = if ($profiles[$index].Name) { $profiles[$index].Name } else { $profiles[$index].Path }
  $defaultLabel = if ($profiles[$index].Default) { ' (domyślny)' } else { '' }
  Write-Host ('[{0}] {1}{2}' -f ($index + 1), $label, $defaultLabel)
}
$profileChoice = 0
if (-not [int]::TryParse((Read-Host 'Numer profilu'), [ref]$profileChoice) -or $profileChoice -lt 1 -or $profileChoice -gt $profiles.Count) { throw 'Nieprawidłowy wybór profilu. Nie wprowadzono żadnych zmian.' }
$profile = $profiles[$profileChoice - 1]
$prefsPath = Join-Path $profile.Path 'prefs.js'
$prefsText = [System.IO.File]::ReadAllText($prefsPath)

function Get-PrefString([string]$Name, [string]$Text) {
  $pattern = 'user_pref\("' + [regex]::Escape($Name) + '",\s*("(?:\\.|[^"\\])*")\s*\);'
  $match = [regex]::Match($Text, $pattern)
  if (-not $match.Success) { return $null }
  return (ConvertFrom-Json -InputObject $match.Groups[1].Value)
}

$accountKeys = Get-PrefString 'mail.accountmanager.accounts' $prefsText
if (-not $accountKeys) { throw 'Nie znaleziono kont Thunderbirda w wybranym profilu.' }
$identities = @()
foreach ($accountKey in ($accountKeys -split ',' | Where-Object { $_ })) {
  $identityKeys = Get-PrefString ('mail.account.{0}.identities' -f $accountKey) $prefsText
  foreach ($identityKey in ($identityKeys -split ',' | Where-Object { $_ })) {
    $email = Get-PrefString ('mail.identity.{0}.useremail' -f $identityKey) $prefsText
    $fullName = Get-PrefString ('mail.identity.{0}.fullName' -f $identityKey) $prefsText
    $label = if ($email -and $fullName) { '{0} ({1})' -f $email, $fullName } elseif ($email) { $email } else { $identityKey }
    $identities += [PSCustomObject]@{ Key = $identityKey; Label = $label }
  }
}
if ($identities.Count -eq 0) { throw 'Nie znaleziono tożsamości Thunderbirda. Nie wprowadzono żadnych zmian.' }

Write-Host 'Wybierz konto dla tego podpisu:'
for ($index = 0; $index -lt $identities.Count; $index++) { Write-Host ('[{0}] {1}' -f ($index + 1), $identities[$index].Label) }
$identityChoice = 0
if (-not [int]::TryParse((Read-Host 'Numer konta'), [ref]$identityChoice) -or $identityChoice -lt 1 -or $identityChoice -gt $identities.Count) { throw 'Nieprawidłowy wybór konta. Nie wprowadzono żadnych zmian.' }
$identityKey = $identities[$identityChoice - 1].Key

$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$backupDirectory = Join-Path $profile.Path ('signature-backup-' + $timestamp)
$signatureDirectory = Join-Path $profile.Path 'Signatures'
$signaturePath = Join-Path $signatureDirectory 'department-signature.html'
$signatureBackup = Join-Path $backupDirectory 'department-signature.html'
$prefsBackup = Join-Path $backupDirectory 'prefs.js'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
Copy-Item -LiteralPath $prefsPath -Destination $prefsBackup
$hadSignature = Test-Path -LiteralPath $signaturePath -PathType Leaf
if ($hadSignature) { Copy-Item -LiteralPath $signaturePath -Destination $signatureBackup }

$identityPrefix = 'mail.identity.' + $identityKey + '.'
$removePattern = '(?m)^user_pref\("' + [regex]::Escape($identityPrefix) + '(?:sig_file|sig_file-rel|attach_signature)",.*\);\r?\n?'
$updatedPrefs = [regex]::Replace($prefsText, $removePattern, '')
$signaturePathJson = ConvertTo-Json -InputObject $signaturePath -Compress
$updatedPrefs += [System.Environment]::NewLine + ('user_pref("{0}sig_file", {1});' -f $identityPrefix, $signaturePathJson)
$updatedPrefs += [System.Environment]::NewLine + ('user_pref("{0}attach_signature", true);' -f $identityPrefix)

$utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
$signatureTemp = $signaturePath + '.tmp'
$prefsTemp = $prefsPath + '.tmp'
try {
  New-Item -ItemType Directory -Path $signatureDirectory -Force | Out-Null
  [System.IO.File]::WriteAllText($signatureTemp, $signatureHtml, $utf8)
  Move-Item -LiteralPath $signatureTemp -Destination $signaturePath -Force
  [System.IO.File]::WriteAllText($prefsTemp, $updatedPrefs, $utf8)
  Move-Item -LiteralPath $prefsTemp -Destination $prefsPath -Force
} catch {
  if (Test-Path -LiteralPath $prefsBackup -PathType Leaf) { Copy-Item -LiteralPath $prefsBackup -Destination $prefsPath -Force }
  if ($hadSignature -and (Test-Path -LiteralPath $signatureBackup -PathType Leaf)) {
    Copy-Item -LiteralPath $signatureBackup -Destination $signaturePath -Force
  } elseif (-not $hadSignature -and (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
    Remove-Item -LiteralPath $signaturePath -Force
  }
  Remove-Item -LiteralPath $signatureTemp, $prefsTemp -Force -ErrorAction SilentlyContinue
  throw
}

Write-Host ('Zainstalowano podpis dla konta: {0}.' -f $identities[$identityChoice - 1].Label)
Write-Host ('Kopia zapasowa została zapisana w: {0}.' -f $backupDirectory)
`;
}

function createThunderbirdLauncher(): string {
  return String.raw`@echo off
setlocal
set "THUNDERBIRD_INSTALLER=%~dpn0.ps1"
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $policies = @(Get-ExecutionPolicy -List); $groupPolicy = @($policies | Where-Object { $_.Scope -in @('MachinePolicy', 'UserPolicy') -and $_.ExecutionPolicy -ne 'Undefined' }); $blockedPolicy = @($groupPolicy | Where-Object { $_.ExecutionPolicy -in @('Restricted', 'AllSigned') }); if ($blockedPolicy.Count -gt 0) { throw 'Uruchamianie skryptów PowerShell jest ograniczone przez organizację. Skontaktuj się z działem IT.' }; if ($groupPolicy.Count -eq 0) { Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned }; $installer = $env:THUNDERBIRD_INSTALLER; if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Umieść plik uruchamiający obok odpowiadającego mu instalatora .ps1.' }; Unblock-File -LiteralPath $installer; & $installer"
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%
`;
}

export function generateSignatureArtifacts(
  employee: EmployeeDTO,
  logo: DepartmentLogoAsset | null,
): SignatureArtifacts {
  if (logo && !ALLOWED_LOGO_TYPES.has(logo.contentType)) {
    throw new Error("Department logo has an unsupported content type");
  }

  const outlookHtml = createHtml(employee, logo);
  return {
    outlookHtml,
    thunderbirdInstaller: createThunderbirdInstaller(outlookHtml),
    thunderbirdLauncher: createThunderbirdLauncher(),
  };
}
