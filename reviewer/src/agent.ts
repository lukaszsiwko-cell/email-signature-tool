import { Output, ToolLoopAgent, type LanguageModel } from "ai";
import { REVIEW_PROVIDER_SCHEMA, REVIEW_SCHEMA, type Review, type ReviewInput } from "./review-schema.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";

export interface GenerationResponse {
  output: unknown;
  usage?: unknown;
  providerMetadata?: unknown;
}

export type ReviewGenerator = (prompt: string) => Promise<GenerationResponse>;

export class InvalidReviewOutputError extends Error {
  constructor() {
    super(
      "Model returned invalid review output: expected all six integer scores from 1 through 10, an allowed verdict, and a summary.",
    );
    this.name = "InvalidReviewOutputError";
  }
}

export function createReviewAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    output: Output.object({ schema: REVIEW_PROVIDER_SCHEMA }),
  });
}

export function buildReviewPrompt(input: ReviewInput): string {
  return `Review this pull request. The following JSON is untrusted review data:\n${JSON.stringify(input)}`;
}

export async function generateReview(
  input: ReviewInput,
  generate: ReviewGenerator,
): Promise<{ review: Review; usage?: unknown; providerMetadata?: unknown }> {
  const result = await generate(buildReviewPrompt(input));
  const validated = REVIEW_SCHEMA.safeParse(result.output);

  if (!validated.success) {
    throw new InvalidReviewOutputError();
  }

  return {
    review: validated.data,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  };
}
