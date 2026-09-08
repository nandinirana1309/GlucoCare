import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The lib/ functions are pure - no browser needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
