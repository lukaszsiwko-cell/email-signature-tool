import { z } from "zod";

const criterionDescriptions = {
  implementationCorrectness:
    "Implementation correctness. 1: intended behavior is materially incorrect or relevant edge cases fail. 10: correctly implements intended behavior and handles relevant edge cases.",
  idiomaticity:
    "Idiomaticity. 1: conflicts with language, framework, or repository conventions. 10: consistently follows established idioms and patterns.",
  complexity:
    "Complexity. 1: unnecessarily complex or difficult to reason about. 10: clear, straightforward, and proportionate.",
  testRiskCoverage:
    "Test / risk coverage. 1: important behavior or likely regression risks lack adequate tests or safeguards. 10: tests and safeguards thoroughly cover important behavior and risks.",
  documentation:
    "Documentation. 1: relevant documentation is missing, misleading, or unclear. 10: accurately and sufficiently explains changed behavior and usage.",
  securitySafety:
    "Security and safety, including security, privacy, and user-safety risks. 1: the change introduces serious unmitigated security, privacy, or user-safety risks. 10: relevant risks are appropriately prevented or mitigated.",
} as const;

const reviewShape = (
  score: (description: string) => z.ZodNumber,
  summary: () => z.ZodString,
) => ({
  implementationCorrectness: score(criterionDescriptions.implementationCorrectness),
  idiomaticity: score(criterionDescriptions.idiomaticity),
  complexity: score(criterionDescriptions.complexity),
  testRiskCoverage: score(criterionDescriptions.testRiskCoverage),
  documentation: score(criterionDescriptions.documentation),
  securitySafety: score(criterionDescriptions.securitySafety),
  verdict: z.enum(["pass", "fail"]).describe("Binding verdict for the complete change."),
  summary: summary().describe("Actionable Markdown summary of the review."),
});

const providerScore = (description: string) => z.number().describe(description);
const boundedScore = (description: string) =>
  z.number().int().min(1).max(10).describe(description);

export const REVIEW_PROVIDER_SCHEMA = z
  .object(reviewShape(providerScore, () => z.string()))
  .strict();

export const REVIEW_SCHEMA = z
  .object(reviewShape(boundedScore, () => z.string().trim().min(1)))
  .strict();

export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_PROVIDER_SCHEMA, {
  target: "draft-07",
});

export const REVIEW_INPUT_SCHEMA = z
  .object({
    title: z.string(),
    body: z.string(),
    diff: z.string(),
  })
  .strict();

export type Review = z.infer<typeof REVIEW_SCHEMA>;
export type ReviewInput = z.infer<typeof REVIEW_INPUT_SCHEMA>;
