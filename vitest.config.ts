import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const integrationBaseUrl = process.env.BASE_URL;

if (process.argv.includes("integration") && !integrationBaseUrl) {
  throw new Error(
    "BASE_URL environment variable is required for integration tests. Point it at a running server, e.g. http://localhost:4321.",
  );
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.unit.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          env: { INTEGRATION_BASE_URL: integrationBaseUrl ?? "" },
          hookTimeout: 30000,
          testTimeout: 30000,
        },
      },
    ],
  },
});
