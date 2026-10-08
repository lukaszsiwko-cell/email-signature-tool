const DEFAULT_BASE_URL = "http://localhost:4321";
const DEPARTMENT_OPTION_PATTERN = /<option value="([0-9a-fA-F-]{36})"[^>]*>([^<]+)<\/option>/g;

export const BASE_URL = process.env.INTEGRATION_BASE_URL ?? process.env.BASE_URL ?? DEFAULT_BASE_URL;

export interface SeededDepartment {
  id: string;
  name: string;
}

export interface RequestOptions {
  method?: string;
  form?: Record<string, string>;
  json?: unknown;
  multipart?: FormData;
  jar?: string;
}

export interface HttpResponse {
  status: number;
  location: string;
  cacheControl: string;
  body: string;
}

interface CookieJar {
  header(): string;
  store(response: Response): void;
}

const jars: Partial<Record<string, CookieJar>> = { default: makeJar() };

let reachabilityCheck: Promise<void> | null = null;

function makeJar(): CookieJar {
  const jar = new Map<string, string>();

  return {
    header() {
      return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    store(response) {
      for (const raw of getSetCookie(response.headers)) {
        const [pair, ...attrs] = raw.split(";");
        const [name, ...rest] = pair.split("=");
        const expired = attrs.some((attribute) => /max-age=0/i.test(attribute.trim()));

        if (expired) {
          jar.delete(name.trim());
        } else {
          jar.set(name.trim(), rest.join("="));
        }
      }
    },
  };
}

function getSetCookie(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };

  if (typeof headersWithSetCookie.getSetCookie === "function") {
    return headersWithSetCookie.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");
  return setCookie === null ? [] : [setCookie];
}

function createBaseUrlUnreachableError(cause: unknown): Error {
  const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : "";

  return new Error(
    `Integration tests could not reach ${BASE_URL}. Start "supabase start" and an Astro dev/preview server for this repo, then point BASE_URL at that server if it is not ${DEFAULT_BASE_URL}.${detail}`,
  );
}

function getJar(name: string): CookieJar {
  const existing = jars[name];
  if (existing) {
    return existing;
  }

  const jar = makeJar();
  jars[name] = jar;
  return jar;
}

export function resetJar(name: string): void {
  if (name === "default") {
    jars.default = makeJar();
    return;
  }

  jars[name] = undefined;
}

export async function ensureBaseUrlReachable(): Promise<void> {
  if (reachabilityCheck) {
    return reachabilityCheck;
  }

  reachabilityCheck = (async () => {
    try {
      await fetch(new URL("/auth/signup", BASE_URL), { redirect: "manual" });
    } catch (error) {
      reachabilityCheck = null;
      throw createBaseUrlUnreachableError(error);
    }
  })();

  return reachabilityCheck;
}

export async function request(path: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const { method = "GET", form, json, multipart, jar = "default" } = options;
  const cookieJar = getJar(jar);
  let body: BodyInit | undefined;

  if (multipart) {
    body = multipart;
  } else if (form) {
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    body = JSON.stringify(json);
  }

  try {
    const response = await fetch(new URL(path, BASE_URL), {
      method,
      redirect: "manual",
      headers: {
        Cookie: cookieJar.header(),
        Origin: BASE_URL,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });

    cookieJar.store(response);

    return {
      status: response.status,
      location: response.headers.get("location") ?? "",
      cacheControl: response.headers.get("cache-control") ?? "",
      body: await response.text(),
    };
  } catch (error) {
    throw createBaseUrlUnreachableError(error);
  }
}

export async function fetchSeededDepartments(): Promise<SeededDepartment[]> {
  await ensureBaseUrlReachable();

  const { body } = await request("/auth/signup");
  const matches = [...body.matchAll(DEPARTMENT_OPTION_PATTERN)];

  return matches.map(([, id, name]) => ({ id, name: name.trim() }));
}
