// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

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
  return { status: response.status, location: response.headers.get("location") ?? "", body };
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
  const includesOk = expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes);
  const excludesOk = expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes);
  const ok = statusOk && locationOk && includesOk && excludesOk;

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
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["employees page redirects anonymous user", () => request("/employees"), { status: 302, location: "/auth/signin" }],
  ["GET /api/employees rejects anonymous user", () => request("/api/employees"), { status: 401 }],
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
        json: { firstName: "Smoke", lastName: employeeLastName, position: "Tester", phone: "+48 600 000 000" },
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
    { status: 201, bodyIncludes: employeeLastName },
  ],
  [
    "add employee rejects missing field",
    () => request("/api/employees", { method: "POST", json: { firstName: "Smoke", position: "Tester", phone: "1" } }),
    { status: 400, bodyIncludes: "Validation failed" },
  ],
  [
    "employees page lists the newly added employee",
    () => request("/employees"),
    { status: 200, bodyIncludes: employeeLastName },
  ],
  [
    "edit employee via API (PUT)",
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
    { status: 200, bodyIncludes: editedFirstName },
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
    { status: 200, bodyIncludes: "No logo set" },
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
