import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REVIEW_SCHEMA, type Review, type ReviewInput } from "./review-schema.js";

const COMMENT_MARKER = "<!-- ai-cr-review -->";
const LABELS = {
  passed: { name: "ai-cr:passed", color: "0e8a16" },
  failed: { name: "ai-cr:failed", color: "d73a4a" },
  retry: { name: "ai-cr:review", color: "fbca04" },
} as const;
const API_VERSION = "2022-11-28";
const COMMENTS_PER_PAGE = 100;

interface PullRequest {
  title: string;
  body: string | null;
}

interface IssueComment {
  id: number;
  body: string | null;
}

interface IssueLabel {
  name: string;
}

interface GitHubReviewOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  runReviewer?: (
    input: ReviewInput,
    configuration: { apiKey: string; model: string },
  ) => Promise<Review>;
  writeOutput?: (verdict: Review["verdict"]) => void | Promise<void>;
}

function requiredEnvironmentValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required configuration: ${name}.`);
  }
  return value;
}

function makeReviewComment(review: Review): string {
  const rows = [
    ["Implementation correctness", review.implementationCorrectness],
    ["Idiomaticity", review.idiomaticity],
    ["Complexity", review.complexity],
    ["Test / risk coverage", review.testRiskCoverage],
    ["Documentation", review.documentation],
    ["Security and safety", review.securitySafety],
  ]
    .map(([criterion, score]) => `| ${criterion} | ${score} / 10 |`)
    .join("\n");

  return [
    COMMENT_MARKER,
    `## AI code review: ${review.verdict}`,
    "",
    "| Criterion | Score |",
    "| --- | ---: |",
    rows,
    "",
    "### Summary",
    "",
    review.summary,
  ].join("\n");
}

function redactSecrets(message: string, secrets: string[]): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }
  return redacted
    .replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-or-v1-[a-z0-9_-]{12,}\b/gi, "[REDACTED]")
    .slice(0, 500);
}

export function describeOperationalError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const message = error instanceof Error ? error.message : "An unknown error occurred.";
  return redactSecrets(message, [env.GITHUB_TOKEN ?? "", env.OPENROUTER_API_KEY ?? ""]);
}

export async function runReviewerCli(
  input: ReviewInput,
  configuration: { apiKey: string; model: string },
  env: NodeJS.ProcessEnv,
  spawnProcess: typeof spawn = spawn,
): Promise<Review> {
  const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
  const childEnvironment: NodeJS.ProcessEnv = {
    ...env,
    OPENROUTER_API_KEY: configuration.apiKey,
    OPENROUTER_MODEL: configuration.model,
  };
  delete childEnvironment.GITHUB_TOKEN;
  delete childEnvironment.GITHUB_OUTPUT;

  const child = spawnProcess(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: packageDirectory,
    env: childEnvironment,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error("Could not start the reviewer process.");
  }

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
    child.stdin.end(JSON.stringify(input));
  });

  if (exitCode !== 0) {
    const details = redactSecrets(stderr.trim(), [configuration.apiKey, env.GITHUB_TOKEN ?? ""]);
    throw new Error(details || `Reviewer process failed with exit code ${exitCode}.`);
  }
  if (stderr.trim()) {
    process.stderr.write(`${redactSecrets(stderr.trim(), [configuration.apiKey, env.GITHUB_TOKEN ?? ""])}\n`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Reviewer process returned invalid JSON.");
  }

  const validation = REVIEW_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    throw new Error("Reviewer process returned an invalid review.");
  }
  return validation.data;
}

function writeActionOutput(verdict: Review["verdict"], env: NodeJS.ProcessEnv): void {
  const outputFile = requiredEnvironmentValue(env, "GITHUB_OUTPUT");
  appendFileSync(outputFile, `verdict=${verdict}\n`, "utf8");
}

export async function runGithubReview(options: GitHubReviewOptions = {}): Promise<Review> {
  const env = options.env ?? process.env;
  const prNumber = requiredEnvironmentValue(env, "PR_NUMBER");
  if (!/^[1-9]\d*$/.test(prNumber)) {
    throw new Error("PR_NUMBER must be a positive integer.");
  }
  const token = requiredEnvironmentValue(env, "GITHUB_TOKEN");
  const apiKey = requiredEnvironmentValue(env, "OPENROUTER_API_KEY");
  const model = requiredEnvironmentValue(env, "OPENROUTER_MODEL");
  const repository = requiredEnvironmentValue(env, "GITHUB_REPOSITORY").split("/");
  if (repository.length !== 2 || repository.some((part) => !part)) {
    throw new Error("GITHUB_REPOSITORY must use the owner/repository format.");
  }

  const [owner, repo] = repository;
  const apiUrl = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/vnd.github+json");
    }
    headers.set("X-GitHub-Api-Version", API_VERSION);
    const response = await fetcher(`${apiUrl}${repositoryPath}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status}).`);
    }
    return response;
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(path, init);
    return (await response.json()) as T;
  }

  const pullRequestPath = `/pulls/${prNumber}`;
  const pullRequest = await requestJson<PullRequest>(pullRequestPath);
  if (
    typeof pullRequest.title !== "string" ||
    (pullRequest.body !== null && typeof pullRequest.body !== "string")
  ) {
    throw new Error("GitHub returned invalid pull request metadata.");
  }

  const diffResponse = await request(pullRequestPath, {
    headers: { Accept: "application/vnd.github.diff" },
  });
  const input: ReviewInput = {
    title: pullRequest.title,
    body: pullRequest.body ?? "",
    diff: await diffResponse.text(),
  };
  const review = await (options.runReviewer ?? ((reviewInput, configuration) =>
    runReviewerCli(reviewInput, configuration, env)))(input, { apiKey, model });
  const validatedReview = REVIEW_SCHEMA.parse(review);
  const commentBody = makeReviewComment(validatedReview);
  const commentsPath = `/issues/${prNumber}/comments`;
  const comments: IssueComment[] = [];

  for (let page = 1; ; page += 1) {
    const pageComments = await requestJson<IssueComment[]>(
      `${commentsPath}?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
    );
    if (!Array.isArray(pageComments)) {
      throw new Error("GitHub returned an invalid comment list.");
    }
    comments.push(...pageComments);
    if (pageComments.length < COMMENTS_PER_PAGE) {
      break;
    }
  }

  const existingComment = comments.find(
    (comment) => typeof comment.body === "string" && comment.body.includes(COMMENT_MARKER),
  );
  if (existingComment) {
    await request(`/issues/comments/${existingComment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
  } else {
    await request(commentsPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
  }

  const issueLabels = await requestJson<IssueLabel[]>(`/issues/${prNumber}/labels`);
  if (!Array.isArray(issueLabels)) {
    throw new Error("GitHub returned an invalid label list.");
  }
  const currentLabelNames = new Set(issueLabels.map((label) => label.name));
  const expectedLabel = validatedReview.verdict === "pass" ? LABELS.passed : LABELS.failed;
  const oppositeLabel = validatedReview.verdict === "pass" ? LABELS.failed : LABELS.passed;
  if (currentLabelNames.has(oppositeLabel.name)) {
    await request(`/issues/${prNumber}/labels/${encodeURIComponent(oppositeLabel.name)}`, {
      method: "DELETE",
    });
  }

  async function ensureLabel(label: { name: string; color: string }): Promise<void> {
    const path = `/labels/${encodeURIComponent(label.name)}`;
    const response = await fetcher(`${apiUrl}${repositoryPath}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    if (response.status === 404) {
      await request("/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: label.name, color: label.color }),
      });
      return;
    }
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status}).`);
    }
  }

  await ensureLabel(expectedLabel);
  await ensureLabel(LABELS.retry);
  await request(`/issues/${prNumber}/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([expectedLabel.name]),
  });

  if (currentLabelNames.has(LABELS.retry.name)) {
    await request(`/issues/${prNumber}/labels/${encodeURIComponent(LABELS.retry.name)}`, {
      method: "DELETE",
    });
  }

  await (options.writeOutput ?? ((verdict) => writeActionOutput(verdict, env)))(validatedReview.verdict);
  return validatedReview;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void runGithubReview().catch((error: unknown) => {
    console.error(`GitHub review failed: ${describeOperationalError(error)}`);
    process.exitCode = 1;
  });
}
