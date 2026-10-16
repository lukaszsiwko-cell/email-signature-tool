import { describe, expect, it } from "vitest";
import { runCli } from "./index.js";

const input = JSON.stringify({ title: "PR", body: "", diff: "diff" });
const validReview = {
  implementationCorrectness: 8,
  idiomaticity: 8,
  complexity: 7,
  testRiskCoverage: 8,
  documentation: 6,
  securitySafety: 9,
  verdict: "pass",
  summary: "The change is sound.",
};

function streamFrom(value: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function capture() {
  const writes: string[] = [];
  return {
    writes,
    stream: { write: (value: string) => writes.push(value) },
  };
}

describe("review CLI", () => {
  it("emits only the validated review JSON to stdout and usage metadata to stderr", async () => {
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli({
      stdin: streamFrom(input),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { OPENROUTER_API_KEY: "test-secret", OPENROUTER_MODEL: "test/model" },
      generate: async () => ({
        output: validReview,
        usage: { inputTokens: 10, outputTokens: 5 },
        providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.writes.join(""))).toEqual(validReview);
    expect(JSON.parse(stderr.writes.join("")).usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      providerCostUsd: 0.001,
    });
  });

  it("reports malformed JSON and invalid input without invoking a model", async () => {
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli({
      stdin: streamFrom("{"),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: {},
      generate: async () => {
        throw new Error("must not be called");
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout.writes).toEqual([]);
    expect(stderr.writes.join("")).toContain("Input must be valid JSON.");

    const invalidInputError = capture();
    const invalidInputExitCode = await runCli({
      stdin: streamFrom(JSON.stringify({ title: "missing body and diff" })),
      stdout: capture().stream,
      stderr: invalidInputError.stream,
      env: {},
    });

    expect(invalidInputExitCode).toBe(1);
    expect(invalidInputError.writes.join("")).toContain("Invalid input");
  });

  it("surfaces missing OpenRouter configuration without calling the provider", async () => {
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli({
      stdin: streamFrom(input),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: {},
      generate: async () => {
        throw new Error("must not be called");
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout.writes).toEqual([]);
    expect(stderr.writes.join("")).toContain("OPENROUTER_API_KEY");
    expect(stderr.writes.join("")).toContain("OPENROUTER_MODEL");
  });

  it("reports invalid model output and never writes the invalid result", async () => {
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli({
      stdin: streamFrom(input),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { OPENROUTER_API_KEY: "test-secret", OPENROUTER_MODEL: "test/model" },
      generate: async () => ({ output: { ...validReview, documentation: 0 } }),
    });

    expect(exitCode).toBe(1);
    expect(stdout.writes).toEqual([]);
    expect(stderr.writes.join("")).toContain("invalid review output");
  });

  it("redacts API secrets from provider errors", async () => {
    const secret = "openrouter-secret-value";
    const stdout = capture();
    const stderr = capture();
    const exitCode = await runCli({
      stdin: streamFrom(input),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { OPENROUTER_API_KEY: secret, OPENROUTER_MODEL: "test/model" },
      generate: async () => {
        throw new Error(`Request failed with ${secret}`);
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr.writes.join("")).toContain("[REDACTED]");
    expect(stderr.writes.join("")).not.toContain(secret);
  });
});
