import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/e2e/projectflow.e2e.test.ts"],
    hookTimeout: 60_000,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
