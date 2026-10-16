import { describe, expect, it } from "vitest";
import { REVIEW_JSON_SCHEMA, REVIEW_PROVIDER_SCHEMA, REVIEW_SCHEMA } from "./review-schema.js";

const validReview = {
  implementationCorrectness: 8,
  idiomaticity: 8,
  complexity: 7,
  testRiskCoverage: 8,
  documentation: 6,
  securitySafety: 9,
  verdict: "pass",
  summary: "## Review\n\nThe change is sound.",
};

const scoreFields = [
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "documentation",
  "securitySafety",
] as const;

describe("review schema", () => {
  it("requires all six bounded integer scores, an allowed verdict, and a summary", () => {
    expect(REVIEW_SCHEMA.safeParse(validReview).success).toBe(true);

    for (const field of scoreFields) {
      for (const score of [0, 11, 1.5, -1, Number.NaN]) {
        expect(REVIEW_SCHEMA.safeParse({ ...validReview, [field]: score }).success).toBe(false);
      }
    }

    expect(REVIEW_SCHEMA.safeParse({ ...validReview, verdict: "maybe" }).success).toBe(false);
    expect(REVIEW_SCHEMA.safeParse({ ...validReview, summary: undefined }).success).toBe(false);
    const missingScore = Object.fromEntries(
      Object.entries(validReview).filter(([field]) => field !== "securitySafety"),
    );
    expect(REVIEW_SCHEMA.safeParse(missingScore).success).toBe(false);
    expect(REVIEW_SCHEMA.safeParse({ ...validReview, summary: "  " }).success).toBe(false);
  });

  it("accepts the inclusive score endpoints", () => {
    expect(
      REVIEW_SCHEMA.safeParse({
        ...validReview,
        implementationCorrectness: 1,
        securitySafety: 10,
      }).success,
    ).toBe(true);
  });

  it("keeps provider output schema compatible while enforcing bounds in the runtime schema", () => {
    const providerSchema = REVIEW_JSON_SCHEMA as {
      type: string;
      required: string[];
      properties: Record<string, { type?: string; minimum?: number; maximum?: number }>;
    };

    expect(providerSchema.type).toBe("object");
    expect(providerSchema.required).toEqual([...scoreFields, "verdict", "summary"]);
    for (const field of scoreFields) {
      expect(providerSchema.properties[field].type).toBe("number");
      expect(providerSchema.properties[field]).not.toHaveProperty("minimum");
      expect(providerSchema.properties[field]).not.toHaveProperty("maximum");
    }
    expect(REVIEW_PROVIDER_SCHEMA.safeParse(validReview).success).toBe(true);
  });
});
