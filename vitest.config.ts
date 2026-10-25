import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The lib/ functions are pure - no browser needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Real-network tests run separately: npm run test:supabase
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
    // Unit tests must not depend on a developer's local .env: Vite would
    // otherwise load it and switch services (Supabase, AI) into "configured"
    // mode. The opt-in integration test reads .env itself.
    env: {
      VITE_AI_FUNCTION_URL: "",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
  },
});
