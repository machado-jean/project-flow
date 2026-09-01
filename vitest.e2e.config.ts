import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    fileParallelism: false,
    include: ["tests/e2e/**/*.application.e2e.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 60_000,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
