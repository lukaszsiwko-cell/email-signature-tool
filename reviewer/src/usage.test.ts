import { describe, expect, it } from "vitest";
import { extractUsage } from "./usage.js";

describe("OpenRouter usage extraction", () => {
  it("returns normalized token counts and provider cost", () => {
    expect(
      extractUsage(
        { inputTokens: 120, outputTokens: 30 },
        { openrouter: { usage: { cost: 0.0025 } } },
      ),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      providerCostUsd: 0.0025,
    });
  });

  it("accepts provider token aliases and rejects invalid usage values", () => {
    expect(
      extractUsage(
        { prompt_tokens: 42, completion_tokens: -2, total_tokens: 45 },
        { openrouter: { usage: { cost: "unknown" } } },
      ),
    ).toEqual({
      inputTokens: 42,
      outputTokens: null,
      totalTokens: 45,
      providerCostUsd: null,
    });
  });

  it("reports missing metadata without inventing usage", () => {
    expect(extractUsage(undefined, undefined)).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCostUsd: null,
    });
  });
});
