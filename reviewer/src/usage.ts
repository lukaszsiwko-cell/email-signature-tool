type UnknownRecord = Record<string, unknown>;

export interface ReviewUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  providerCostUsd: number | null;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function nonNegativeNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return null;
}

export function extractUsage(usage: unknown, providerMetadata: unknown): ReviewUsage {
  const usageRecord = asRecord(usage);
  const metadataRecord = asRecord(providerMetadata);
  const openRouterRecord = asRecord(metadataRecord?.openrouter);
  const providerUsage = asRecord(openRouterRecord?.usage);
  const inputTokens = nonNegativeNumber(
    usageRecord?.inputTokens,
    usageRecord?.promptTokens,
    usageRecord?.prompt_tokens,
  );
  const outputTokens = nonNegativeNumber(
    usageRecord?.outputTokens,
    usageRecord?.completionTokens,
    usageRecord?.completion_tokens,
  );
  const reportedTotal = nonNegativeNumber(usageRecord?.totalTokens, usageRecord?.total_tokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens: reportedTotal ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    providerCostUsd: nonNegativeNumber(providerUsage?.cost, openRouterRecord?.cost),
  };
}
