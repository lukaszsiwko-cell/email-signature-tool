// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { sendSignatureEmail } from "../src/lib/services/email-service-client.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const password = "Smoke-Test-Passw0rd!";
const runId = Date.now();
const initialLogoPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+s9lsAAAAASUVORK5CYII=",
  "base64",
);
const replacementLogoSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#2563eb" /></svg>',
);

function makeJar() {
  const jar = new Map();
  return {
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    store(response) {
      for (const raw of response.headers.getSetCookie()) {
        const [pair, ...attrs] = raw.split(";");
        const [name, ...rest] = pair.split("=");
        const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
        if (expired) jar.delete(name.trim());
        else jar.set(name.trim(), rest.join("="));
      }
    },
  };
}

// Each "user" gets its own cookie jar so the two smoke accounts never share a session.
const jars = { default: makeJar() };

async function request(path, { method = "GET", form, json, multipart, jar = "default" } = {}) {
  const cookieJar = jars[jar] ?? (jars[jar] = makeJar());
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieJar.header(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: multipart ? multipart : form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  cookieJar.store(response);
  const body = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    body,
  };
}

// The signup page server-renders <option value="{uuid}">{name}</option> for each
// seeded department — parsed here so the smoke test never hardcodes a department id.
async function fetchDepartments() {
  const { body } = await request("/auth/signup");
  const matches = [...body.matchAll(/<option value="([0-9a-fA-F-]{36})"[^>]*>([^<]+)<\/option>/g)];
  return matches.map(([, id, name]) => ({ id, name: name.trim() }));
}

function check(name, actual, expected) {
  const statusOk = actual.status === expected.status;
  const locationOk = expected.location === undefined || actual.location.startsWith(expected.location);
  const cacheControlOk = expected.cacheControl === undefined || actual.cacheControl.includes(expected.cacheControl);
  const includesOk = expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes);
  const excludesOk = expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes);
  const ok = statusOk && locationOk && cacheControlOk && includesOk && excludesOk;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    console.log(
      `      expected status=${expected.status} location=${expected.location ?? ""} bodyIncludes=${expected.bodyIncludes ?? ""} bodyExcludes=${expected.bodyExcludes ?? ""}`,
    );
  }
  return ok;
}

let failed = 0;

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function thunderbirdHtmlFromInstaller(installer) {
  const match = installer.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/);
  return match ? Buffer.from(match[1], "base64").toString("utf8") : "";
}

function objectPathFromSignedUrl(url) {
  return typeof url === "string" ? url.split("?")[0] : "";
}

async function fetchBinary(url) {
  if (typeof url !== "string" || !url) {
    return { status: 500, location: "", body: "missing signed URL" };
  }
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, location: "", body: bytes.toString("base64") };
}

async function uploadLogo(file, jar = "default") {
  const formData = new FormData();
  formData.set("file", new File([file.data], file.name, { type: file.type }));
  return request("/api/departments/logo", { method: "PUT", multipart: formData, jar });
}

const departments = await fetchDepartments();
if (departments.length < 2) {
  console.log(`FAIL  fetch seeded departments  -> found ${departments.length}, need at least 2`);
  console.log("\n1 step(s) failed");
  process.exit(1);
}
const [deptA, deptB] = departments;

const emailA = `smoke-a-${runId}@example.com`;
const emailB = `smoke-b-${runId}@example.com`;
const employeeLastName = `Smoketest-${runId}`;
const editedFirstName = `SmokeEdited-${runId}`;

// Populated once the employee is created via the API, so later edit/delete
// steps can target the real id without hardcoding it.
const state = {
  employeeId: null,
  emailChangeEmployeeId: null,
  signatureEmployeeAId: null,
  signatureEmployeeBId: null,
  signatureDownloadToken: "",
  firstLogoUrl: null,
  firstLogoPath: "",
  replacementLogoUrl: null,
  replacementLogoPath: "",
  replacementLogoBytes: "",
  secondLogoUrl: null,
  secondLogoPath: "",
};

const initialLogoFile = { name: `smoke-logo-${runId}.png`, type: "image/png", data: initialLogoPng };
const replacementLogoFile = { name: `smoke-logo-${runId}.svg`, type: "image/svg+xml", data: replacementLogoSvg };
const expectedInitialLogoBody = initialLogoPng.toString("base64");
const expectedReplacementLogoBody = replacementLogoSvg.toString("base64");

const steps = [
  [
    "Resend receives only recipient, sender, subject, and one-time link",
    async () => {
      let sentMessage;
      try {
        await sendSignatureEmail(
          {
            emails: {
              send: async (message) => {
                sentMessage = message;
                return { data: { id: "mock-message-id" }, error: null };
              },
            },
          },
          {
            fromAddress: "signatures@example.test",
            publicAppUrl: "https://signatures.example.test",
            allowLocalHttp: false,
          },
          { to: "employee@example.test", token: "a".repeat(64) },
        );
        const valid =
          Object.keys(sentMessage).sort().join(",") === "from,subject,text,to" &&
          sentMessage.from === "signatures@example.test" &&
          sentMessage.to === "employee@example.test" &&
          sentMessage.text.includes("https://signatures.example.test/download-signatures#") &&
          !sentMessage.text.includes("thunderbirdInstaller") &&
          !sentMessage.text.includes("artifact_bundle");
        return {
          status: valid ? 200 : 500,
          location: "",
          body: valid ? "Resend contract valid" : "invalid email message",
        };
      } catch {
        return { status: 500, location: "", body: "Resend call threw" };
      }
    },
    { status: 200, bodyIncludes: "Resend contract valid" },
  ],
  [
    "Resend rejects an insecure public app URL before sending",
    async () => {
      let sendCalled = false;
      try {
        await sendSignatureEmail(
          {
            emails: {
              send: async () => {
                sendCalled = true;
                return { data: { id: "mock-message-id" }, error: null };
              },
            },
          },
          {
            fromAddress: "signatures@example.test",
            publicAppUrl: "http://signatures.example.test",
            allowLocalHttp: false,
          },
          { to: "employee@example.test", token: "b".repeat(64) },
        );
      } catch (error) {
        return {
          status:
            !sendCalled && error instanceof Error && error.message === "Public app URL must use HTTPS" ? 200 : 500,
          location: "",
          body: "email HTTPS policy checked",
        };
      }
      return { status: 500, location: "", body: "insecure app URL was accepted" };
    },
    { status: 200, bodyIncludes: "email HTTPS policy checked" },
  ],
  [
    "Resend rejects missing configuration before sending",
    async () => {
      let sendCalled = false;
      try {
        await sendSignatureEmail(
          {
            emails: {
              send: async () => {
                sendCalled = true;
                return { data: { id: "mock-message-id" }, error: null };
              },
            },
          },
          {
            fromAddress: "",
            publicAppUrl: "",
            allowLocalHttp: false,
          },
          { to: "employee@example.test", token: "d".repeat(64) },
        );
      } catch (error) {
        const valid = !sendCalled && error instanceof Error && error.message === "Resend is not configured";
        return { status: valid ? 200 : 500, location: "", body: valid ? error.message : "invalid config handling" };
      }
      return { status: 500, location: "", body: "missing email configuration was accepted" };
    },
    { status: 200, bodyIncludes: "Resend is not configured" },
  ],
  [
    "Resend errors do not expose provider details",
    async () => {
      try {
        await sendSignatureEmail(
          {
            emails: {
              send: async () => ({
                data: null,
                error: { statusCode: 401, message: "private provider diagnostic" },
              }),
            },
          },
          {
            fromAddress: "signatures@example.test",
            publicAppUrl: "https://signatures.example.test",
            allowLocalHttp: false,
          },
          { to: "employee@example.test", token: "e".repeat(64) },
        );
        return { status: 500, location: "", body: "provider failure was accepted" };
      } catch (error) {
        const valid =
          error instanceof Error &&
          error.message === "Resend rejected the message" &&
          error.code === "E_EMAIL_AUTH_FAILED";
        return { status: valid ? 200 : 500, location: "", body: valid ? error.message : "unsafe network error" };
      }
    },
    {
      status: 200,
      bodyIncludes: "Resend rejected the message",
      bodyExcludes: "private provider diagnostic",
    },
  ],
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["employees page redirects anonymous user", () => request("/employees"), { status: 302, location: "/auth/signin" }],
  ["GET /api/employees rejects anonymous user", () => request("/api/employees"), { status: 401 }],
  [
    "POST employee signatures rejects anonymous user",
    () => request("/api/employees/anonymous/signatures", { method: "POST" }),
    { status: 401 },
  ],
  [
    "POST employee signature email rejects anonymous user",
    () => request("/api/employees/anonymous/send-signatures", { method: "POST" }),
    { status: 401 },
  ],
  [
    "signup creates account (department A)",
    () => request("/api/auth/signup", { method: "POST", form: { email: emailA, password, departmentId: deptA.id } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email: emailA, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email: emailA, password } }),
    { status: 302, location: "/" },
  ],
  [
    "home shows the signature workspace after sign-in",
    async () => {
      const res = await request("/");
      const valid =
        res.status === 200 &&
        res.body.includes("Podpisy, które pasują do Twojego zespołu.") &&
        res.body.includes("Podgląd podpisu") &&
        !res.body.includes("Authentication Ready");
      return { ...res, status: valid ? 200 : res.status === 200 ? 500 : res.status };
    },
    { status: 200, bodyIncludes: "Podgląd podpisu" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  [
    "employees page renders for signed-in user (before adding)",
    () => request("/employees"),
    { status: 200, bodyExcludes: employeeLastName },
  ],
  [
    "add employee via API",
    async () => {
      const res = await request("/api/employees", {
        method: "POST",
        json: {
          firstName: "Smoke",
          lastName: employeeLastName,
          email: `smoke-${runId}@example.test`,
          position: "Tester",
          phone: "+48 600 000 000",
        },
      });
      if (res.status === 201) {
        try {
          state.employeeId = JSON.parse(res.body).id;
        } catch {
          // leave state.employeeId null — the later edit/delete steps will fail loudly instead
        }
      }
      return res;
    },
    { status: 201, bodyIncludes: `smoke-${runId}@example.test` },
  ],
  [
    "add employee rejects duplicate email regardless of case",
    () =>
      request("/api/employees", {
        method: "POST",
        json: {
          firstName: "Smoke",
          lastName: `Duplicate-${runId}`,
          email: `SMOKE-${runId}@EXAMPLE.TEST`,
          position: "Tester",
          phone: "1",
        },
      }),
    { status: 409, bodyIncludes: "Taki adres e-mail jest już używany w tym dziale." },
  ],
  [
    "add employee rejects missing email",
    () =>
      request("/api/employees", {
        method: "POST",
        json: { firstName: "Smoke", lastName: `MissingEmail-${runId}`, position: "Tester", phone: "1" },
      }),
    { status: 400, bodyIncludes: "Validation failed" },
  ],
  [
    "add employee with email that can later be cleared",
    async () => {
      const res = await request("/api/employees", {
        method: "POST",
        json: {
          firstName: "Smoke",
          lastName: `EmailChange-${runId}`,
          email: `email-change-${runId}@example.test`,
          position: "Tester",
          phone: "1",
        },
      });
      if (res.status === 201) state.emailChangeEmployeeId = parseJson(res.body)?.id ?? null;
      return res;
    },
    { status: 201, bodyIncludes: `email-change-${runId}@example.test` },
  ],
  [
    "employee cannot be changed to an email already in use",
    () =>
      request(`/api/employees/${state.emailChangeEmployeeId}`, {
        method: "PUT",
        json: {
          firstName: "Smoke",
          lastName: `EmailChange-${runId}`,
          email: `smoke-${runId}@example.test`,
          position: "Tester",
          phone: "1",
        },
      }),
    { status: 409, bodyIncludes: "Taki adres e-mail jest już używany w tym dziale." },
  ],
  [
    "employee email can be cleared",
    () =>
      request(`/api/employees/${state.emailChangeEmployeeId}`, {
        method: "PUT",
        json: {
          firstName: "Smoke",
          lastName: `EmailChange-${runId}`,
          email: "",
          position: "Tester",
          phone: "1",
        },
      }),
    { status: 200, bodyIncludes: '"email":null' },
  ],
  [
    "add employee rejects invalid email",
    () =>
      request("/api/employees", {
        method: "POST",
        json: {
          firstName: "Smoke",
          lastName: `InvalidEmail-${runId}`,
          email: "not-an-email",
          position: "Tester",
          phone: "1",
        },
      }),
    { status: 400, bodyIncludes: "Validation failed" },
  ],
  [
    "employees page lists the newly added employee",
    () => request("/employees"),
    { status: 200, bodyIncludes: `smoke-${runId}@example.test` },
  ],
  [
    "edit employee via API (PUT)",
    () =>
      request(`/api/employees/${state.employeeId}`, {
        method: "PUT",
        json: {
          firstName: editedFirstName,
          lastName: employeeLastName,
          email: `updated-${runId}@example.test`,
          position: "Senior Tester",
          phone: "+48 600 000 001",
        },
      }),
    { status: 200, bodyIncludes: `updated-${runId}@example.test` },
  ],
  [
    "edit employee preserves email when omitted",
    () =>
      request(`/api/employees/${state.employeeId}`, {
        method: "PUT",
        json: {
          firstName: editedFirstName,
          lastName: employeeLastName,
          position: "Senior Tester",
          phone: "+48 600 000 001",
        },
      }),
    { status: 200, bodyIncludes: `updated-${runId}@example.test` },
  ],
  [
    "edit employee rejects missing field",
    () =>
      request(`/api/employees/${state.employeeId}`, {
        method: "PUT",
        json: { firstName: "", lastName: employeeLastName, position: "Senior Tester", phone: "+48 600 000 001" },
      }),
    { status: 400, bodyIncludes: "Validation failed" },
  ],
  [
    "employees page reflects the edited employee",
    () => request("/employees"),
    { status: 200, bodyIncludes: editedFirstName },
  ],
  [
    "signup creates second account (department B)",
    () =>
      request("/api/auth/signup", {
        method: "POST",
        form: { email: emailB, password, departmentId: deptB.id },
        jar: "userB",
      }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "second user signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email: emailB, password }, jar: "userB" }),
    { status: 302, location: "/" },
  ],
  [
    "second user clears a logo left by an earlier smoke run",
    () => request("/api/departments/logo", { method: "DELETE", jar: "userB" }),
    { status: 204 },
  ],
  [
    "second user adds a signature employee before setting a logo",
    async () => {
      const res = await request("/api/employees", {
        method: "POST",
        json: {
          firstName: "SmokeB",
          lastName: `Signature-${runId}`,
          email: `smoke-b-${runId}@example.test`,
          position: "Tester",
          phone: "",
        },
        jar: "userB",
      });
      if (res.status === 201) state.signatureEmployeeBId = JSON.parse(res.body).id;
      return res;
    },
    { status: 201, bodyIncludes: "Signature-" },
  ],
  [
    "second user (different department) cannot see first user's employee",
    () => request("/api/employees", { jar: "userB" }),
    { status: 200, bodyExcludes: employeeLastName },
  ],
  [
    "second user cannot edit first user's employee",
    () =>
      request(`/api/employees/${state.employeeId}`, {
        method: "PUT",
        json: { firstName: "Hijacked", lastName: employeeLastName, position: "Tester", phone: "1" },
        jar: "userB",
      }),
    { status: 404 },
  ],
  [
    "second user cannot delete first user's employee",
    () => request(`/api/employees/${state.employeeId}`, { method: "DELETE", jar: "userB" }),
    { status: 404 },
  ],
  [
    "first user deletes their own employee",
    () => request(`/api/employees/${state.employeeId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "employees page no longer lists the deleted employee",
    () => request("/employees"),
    { status: 200, bodyExcludes: employeeLastName },
  ],
  [
    "first user uploads a department logo",
    async () => {
      const res = await uploadLogo(initialLogoFile);
      const payload = parseJson(res.body);
      if (res.status === 200 && payload?.logoUrl) {
        state.firstLogoUrl = payload.logoUrl;
        state.firstLogoPath = objectPathFromSignedUrl(payload.logoUrl);
      }
      return {
        ...res,
        status: res.status === 200 && !!state.firstLogoUrl ? 200 : res.status === 200 ? 500 : res.status,
        body: res.status === 200 && !!state.firstLogoUrl ? "logoUrl returned" : res.body,
      };
    },
    { status: 200, bodyIncludes: "logoUrl returned" },
  ],
  [
    "first user's signed logo URL returns the uploaded bytes",
    async () => {
      const res = await fetchBinary(state.firstLogoUrl);
      return {
        ...res,
        status:
          res.status === 200 && res.body === expectedInitialLogoBody ? 200 : res.status === 200 ? 500 : res.status,
        body: res.status === 200 && res.body === expectedInitialLogoBody ? "bytes match" : "bytes mismatch",
      };
    },
    { status: 200, bodyIncludes: "bytes match" },
  ],
  [
    "first user replaces their department logo in place",
    async () => {
      const res = await uploadLogo(replacementLogoFile);
      const payload = parseJson(res.body);
      if (res.status === 200 && payload?.logoUrl) {
        state.replacementLogoUrl = payload.logoUrl;
        state.replacementLogoPath = objectPathFromSignedUrl(payload.logoUrl);
      }
      const replacedInPlace = !!state.replacementLogoPath && state.replacementLogoPath === state.firstLogoPath;
      return {
        ...res,
        status: res.status === 200 && replacedInPlace ? 200 : res.status === 200 ? 500 : res.status,
        body: res.status === 200 && replacedInPlace ? "same storage key" : "replacement key mismatch",
      };
    },
    { status: 200, bodyIncludes: "same storage key" },
  ],
  [
    "replacement logo signed URL returns the new bytes",
    async () => {
      const res = await fetchBinary(state.replacementLogoUrl);
      const replaced = res.body === expectedReplacementLogoBody;
      const changed = res.body !== expectedInitialLogoBody;
      if (res.status === 200 && replaced) {
        state.replacementLogoBytes = res.body;
      }
      return {
        ...res,
        status: res.status === 200 && replaced && changed ? 200 : res.status === 200 ? 500 : res.status,
        body: res.status === 200 && replaced && changed ? "replacement bytes match" : "replacement bytes mismatch",
      };
    },
    { status: 200, bodyIncludes: "replacement bytes match" },
  ],
  [
    "first user adds a signature employee with HTML-sensitive data",
    async () => {
      const res = await request("/api/employees", {
        method: "POST",
        json: {
          firstName: "Smoke <script>alert(1)</script>",
          lastName: `Signature-${runId}`,
          email: `signature-${runId}@example.test`,
          position: "Tester & Support",
          phone: "+48 600 000 009",
        },
      });
      if (res.status === 201) state.signatureEmployeeAId = JSON.parse(res.body).id;
      return res;
    },
    { status: 201, bodyIncludes: "Signature-" },
  ],
  [
    "first user gets escaped signatures with a private inline logo",
    async () => {
      const res = await request(`/api/employees/${state.signatureEmployeeAId}/signatures`, { method: "POST" });
      const artifacts = parseJson(res.body);
      const thunderbirdHtml = artifacts?.thunderbirdInstaller
        ? thunderbirdHtmlFromInstaller(artifacts.thunderbirdInstaller)
        : "";
      const body = artifacts
        ? `${artifacts.outlookHtml}\n${artifacts.thunderbirdInstaller}\n${thunderbirdHtml}`
        : res.body;
      const valid =
        typeof artifacts?.outlookHtml === "string" &&
        typeof artifacts?.thunderbirdInstaller === "string" &&
        typeof artifacts?.thunderbirdLauncher === "string" &&
        thunderbirdHtml === artifacts.outlookHtml &&
        artifacts.outlookHtml.includes("&lt;script&gt;") &&
        artifacts.outlookHtml.includes("&amp; Support") &&
        artifacts.outlookHtml.includes("data:image/svg+xml;base64,") &&
        artifacts.thunderbirdInstaller.includes("mail.identity.") &&
        artifacts.thunderbirdInstaller.includes("Press Enter to check again") &&
        artifacts.thunderbirdLauncher.includes("Unblock-File") &&
        artifacts.thunderbirdLauncher.includes("-Scope Process -ExecutionPolicy RemoteSigned") &&
        artifacts.thunderbirdLauncher.includes("MachinePolicy") &&
        !artifacts.thunderbirdInstaller.includes("<script>") &&
        !body.includes("supabase.co") &&
        !body.includes("storage/v1/object");
      return {
        ...res,
        status: valid ? 200 : res.status === 200 ? 500 : res.status,
        body,
      };
    },
    {
      status: 200,
      cacheControl: "no-store",
      bodyIncludes: "&lt;script&gt;",
      bodyExcludes: "<script>alert(1)</script>",
    },
  ],
  [
    "second department cannot send the first user's signature email",
    () =>
      request(`/api/employees/${state.signatureEmployeeAId}/send-signatures`, {
        method: "POST",
        jar: "userB",
      }),
    { status: 404 },
  ],
  [
    "first user issues a one-time signature download",
    async () => {
      const res = await request(`/api/employees/${state.signatureEmployeeAId}/signature-deliveries`, {
        method: "POST",
      });
      const delivery = parseJson(res.body);
      const downloadUrl = typeof delivery?.downloadUrl === "string" ? new URL(delivery.downloadUrl, BASE_URL) : null;
      const token = downloadUrl?.hash.slice(1) ?? "";
      const valid =
        res.status === 201 &&
        downloadUrl?.pathname === "/download-signatures" &&
        /^[0-9a-f]{64}$/.test(token) &&
        Date.parse(delivery.expiresAt) > Date.now();
      if (valid) state.signatureDownloadToken = token;
      return { ...res, status: valid ? 201 : res.status === 201 ? 500 : res.status };
    },
    { status: 201, bodyIncludes: "/download-signatures#" },
  ],
  [
    "recipient page opens without consuming the link",
    () => request("/download-signatures", { jar: "recipient" }),
    { status: 200 },
  ],
  [
    "another department cannot issue a signature download",
    () =>
      request(`/api/employees/${state.signatureEmployeeAId}/signature-deliveries`, {
        method: "POST",
        jar: "userB",
      }),
    { status: 404 },
  ],
  [
    "concurrent recipient redemptions return the artifact bundle once",
    async () => {
      const [firstAttempt, secondAttempt] = await Promise.all([
        request("/api/signature-download/redeem", {
          method: "POST",
          json: { token: state.signatureDownloadToken },
          jar: "recipient",
        }),
        request("/api/signature-download/redeem", {
          method: "POST",
          json: { token: state.signatureDownloadToken },
          jar: "recipient-retry",
        }),
      ]);
      const successfulResponses = [firstAttempt, secondAttempt].filter((attempt) => attempt.status === 200);
      const unavailableResponses = [firstAttempt, secondAttempt].filter((attempt) => attempt.status === 404);
      const artifacts = successfulResponses.length === 1 ? parseJson(successfulResponses[0].body) : null;
      const valid =
        successfulResponses.length === 1 &&
        unavailableResponses.length === 1 &&
        firstAttempt.cacheControl.includes("no-store") &&
        secondAttempt.cacheControl.includes("no-store") &&
        typeof artifacts?.outlookHtml === "string" &&
        typeof artifacts?.thunderbirdInstaller === "string" &&
        typeof artifacts?.thunderbirdLauncher === "string" &&
        artifacts.outlookHtml.includes("data:image/svg+xml;base64,");
      return {
        status: valid ? 200 : 500,
        location: "",
        cacheControl: successfulResponses[0]?.cacheControl ?? "",
        body: successfulResponses[0]?.body ?? "missing artifact bundle",
      };
    },
    { status: 200, cacheControl: "no-store", bodyIncludes: "thunderbirdLauncher" },
  ],
  [
    "redeemed signature download cannot be replayed",
    () =>
      request("/api/signature-download/redeem", {
        method: "POST",
        json: { token: state.signatureDownloadToken },
        jar: "recipient-replay",
      }),
    { status: 404, cacheControl: "no-store", bodyIncludes: "This download link is unavailable" },
  ],
  [
    "second user gets text-only signatures when no logo is configured",
    async () => {
      const res = await request(`/api/employees/${state.signatureEmployeeBId}/signatures`, {
        method: "POST",
        jar: "userB",
      });
      const artifacts = parseJson(res.body);
      const thunderbirdHtml = artifacts?.thunderbirdInstaller
        ? thunderbirdHtmlFromInstaller(artifacts.thunderbirdInstaller)
        : "";
      const body = artifacts
        ? `${artifacts.outlookHtml}\n${artifacts.thunderbirdInstaller}\n${thunderbirdHtml}`
        : res.body;
      const valid =
        typeof artifacts?.outlookHtml === "string" &&
        typeof artifacts?.thunderbirdInstaller === "string" &&
        typeof artifacts?.thunderbirdLauncher === "string" &&
        thunderbirdHtml === artifacts.outlookHtml &&
        artifacts.outlookHtml.includes("SmokeB Signature-") &&
        !artifacts.outlookHtml.includes("<img") &&
        !body.includes("supabase.co");
      return {
        ...res,
        status: valid ? 200 : res.status === 200 ? 500 : res.status,
        body,
      };
    },
    { status: 200, cacheControl: "no-store", bodyIncludes: "SmokeB Signature-", bodyExcludes: "<img" },
  ],
  [
    "second department cannot generate the first department employee's signatures",
    () => request(`/api/employees/${state.signatureEmployeeAId}/signatures`, { method: "POST", jar: "userB" }),
    { status: 404 },
  ],
  [
    "first department cannot generate the second department employee's signatures",
    () => request(`/api/employees/${state.signatureEmployeeBId}/signatures`, { method: "POST" }),
    { status: 404 },
  ],
  [
    "first user deletes their signature employee",
    () => request(`/api/employees/${state.signatureEmployeeAId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "second user deletes their signature employee",
    () => request(`/api/employees/${state.signatureEmployeeBId}`, { method: "DELETE", jar: "userB" }),
    { status: 204 },
  ],
  [
    "second user uploads a separate department logo",
    async () => {
      const res = await uploadLogo(initialLogoFile, "userB");
      const payload = parseJson(res.body);
      if (res.status === 200 && payload?.logoUrl) {
        state.secondLogoUrl = payload.logoUrl;
        state.secondLogoPath = objectPathFromSignedUrl(payload.logoUrl);
      }
      const isolatedStorageKeys =
        !!state.secondLogoPath && !!state.replacementLogoPath && state.secondLogoPath !== state.replacementLogoPath;
      return {
        ...res,
        status: res.status === 200 && isolatedStorageKeys ? 200 : res.status === 200 ? 500 : res.status,
        body: res.status === 200 && isolatedStorageKeys ? "different storage key" : "storage key mismatch",
      };
    },
    { status: 200, bodyIncludes: "different storage key" },
  ],
  [
    "second user removes their smoke-test department logo",
    () => request("/api/departments/logo", { method: "DELETE", jar: "userB" }),
    { status: 204 },
  ],
  [
    "second user's logo does not affect the first user's logo",
    async () => {
      const res = await fetchBinary(state.replacementLogoUrl);
      const unchanged =
        res.status === 200 && res.body === state.replacementLogoBytes && res.body === expectedReplacementLogoBody;
      return {
        ...res,
        status: unchanged ? 200 : res.status === 200 ? 500 : res.status,
        body: unchanged ? "first logo unchanged" : "first logo changed",
      };
    },
    { status: 200, bodyIncludes: "first logo unchanged" },
  ],
  [
    "first user removes their department logo",
    () => request("/api/departments/logo", { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "employees page shows the no-logo placeholder after removal",
    () => request("/employees"),
    { status: 200, bodyIncludes: "Nie dodano jeszcze logo" },
  ],
  [
    "first user deletes the employee with cleared email",
    () => request(`/api/employees/${state.emailChangeEmployeeId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

for (const [name, run, expected] of steps) {
  const actual = await run();
  if (!check(name, actual, expected)) failed++;
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
