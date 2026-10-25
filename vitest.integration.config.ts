import { defineConfig, loadEnv } from "vite";

/**
 * Opt-in integration tests against the REAL services configured in .env
 * (Supabase project). Run with:  npm run test:supabase
 * They create anonymous test users, write test rows and delete those rows
 * again at the end. Never run automatically.
 */
export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: loadEnv(mode, process.cwd(), "VITE_"),
  },
}));
