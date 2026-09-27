// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const password = "Smoke-Test-Passw0rd!";
const runId = Date.now();

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

async function request(path, { method = "GET", form, json, jar = "default" } = {}) {
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
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
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
    () =>
      request("/api/employees", {
        method: "POST",
        json: { firstName: "Smoke", lastName: employeeLastName, position: "Tester", phone: "+48 600 000 000" },
      }),
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
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
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
];

for (const [name, run, expected] of steps) {
  const actual = await run();
  if (!check(name, actual, expected)) failed++;
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
