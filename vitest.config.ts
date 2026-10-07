import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.argv.includes("integration") && !process.env.BASE_URL) {
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
          hookTimeout: 30000,
          testTimeout: 30000,
        },
      },
    ],
  },
});
