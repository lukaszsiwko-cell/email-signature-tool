import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { pathToFileURL } from "node:url";
import { createReviewAgent, generateReview, type GenerationResponse } from "./agent.js";
import { REVIEW_INPUT_SCHEMA, type ReviewInput } from "./review-schema.js";
import { extractUsage } from "./usage.js";

export {
  buildReviewPrompt,
  createReviewAgent,
  generateReview,
  InvalidReviewOutputError,
} from "./agent.js";
export type { GenerationResponse, ReviewGenerator } from "./agent.js";
export { REVIEW_INPUT_SCHEMA, REVIEW_JSON_SCHEMA, REVIEW_PROVIDER_SCHEMA, REVIEW_SCHEMA } from "./review-schema.js";
export type { Review, ReviewInput } from "./review-schema.js";
export { extractUsage } from "./usage.js";
export type { ReviewUsage } from "./usage.js";

interface CliDependencies {
  stdin?: AsyncIterable<string | Uint8Array>;
  stdout?: { write(value: string): unknown };
  stderr?: { write(value: string): unknown };
  env?: NodeJS.ProcessEnv;
  generate?: (
    prompt: string,
    configuration: { apiKey: string; model: string },
  ) => Promise<GenerationResponse>;
}

async function readInput(stdin: AsyncIterable<string | Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function redact(message: string, apiKey: string | undefined): string {
  const withKeyRedacted = apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
  return withKeyRedacted
    .replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-or-v1-[a-z0-9_-]{12,}\b/gi, "[REDACTED]")
    .slice(0, 500);
}

function describeError(error: unknown, apiKey: string | undefined): string {
  if (error instanceof SyntaxError) {
    return "Input must be valid JSON.";
  }

  if (error instanceof Error) {
    return redact(error.message, apiKey);
  }

  return "An unknown error occurred.";
}

async function generateWithOpenRouter(
  prompt: string,
  configuration: { apiKey: string; model: string },
): Promise<GenerationResponse> {
  const provider = createOpenRouter({ apiKey: configuration.apiKey });
  const agent = createReviewAgent(provider(configuration.model));
  const response = await agent.generate({ prompt });
  const result = response as unknown as {
    output: unknown;
    usage?: unknown;
    totalUsage?: unknown;
    providerMetadata?: unknown;
    steps?: Array<{ usage?: unknown; providerMetadata?: unknown }>;
  };
  const finalStep = result.steps?.at(-1);

  return {
    output: result.output,
    usage: result.totalUsage ?? result.usage ?? finalStep?.usage,
    providerMetadata: result.providerMetadata ?? finalStep?.providerMetadata,
  };
}

export async function runCli(dependencies: CliDependencies = {}): Promise<number> {
  const stdin = dependencies.stdin ?? process.stdin;
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const env = dependencies.env ?? process.env;
  const apiKey = env.OPENROUTER_API_KEY;

  try {
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(await readInput(stdin));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Input must be valid JSON.", { cause: error });
      }
      throw error;
    }

    const inputResult = REVIEW_INPUT_SCHEMA.safeParse(parsedInput);
    if (!inputResult.success) {
      throw new Error("Invalid input: expected a JSON object with string title, body, and diff fields.");
    }
    const input: ReviewInput = inputResult.data;

    const missingConfiguration = [
      apiKey ? undefined : "OPENROUTER_API_KEY",
      env.OPENROUTER_MODEL ? undefined : "OPENROUTER_MODEL",
    ].filter((name): name is string => name !== undefined);
    if (missingConfiguration.length > 0) {
      throw new Error(`Missing required configuration: ${missingConfiguration.join(", ")}.`);
    }

    const model = env.OPENROUTER_MODEL as string;
    const generate = dependencies.generate ?? generateWithOpenRouter;
    const result = await generateReview(input, (prompt) =>
      generate(prompt, { apiKey: apiKey as string, model }),
    );

    stdout.write(`${JSON.stringify(result.review)}\n`);
    stderr.write(
      `${JSON.stringify({
        event: "review_usage",
        model,
        usage: extractUsage(result.usage, result.providerMetadata),
      })}\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(`Review failed: ${describeError(error, apiKey)}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
