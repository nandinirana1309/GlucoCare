/**
 * GlucoCare end-to-end test runner:   npm run test:e2e   [suite names...]
 *
 * Self-contained and safe to run anytime:
 *  - starts its OWN Vite dev server (port 5199) in "this device" mode -
 *    Supabase and the real AI are switched OFF for this run, whatever .env says
 *  - starts mock AI services (tests only; never used by the app itself)
 *  - drives the installed Chrome / Edge with playwright-core
 * Results: PASS / FAIL / SKIP (SKIP = an external service such as the OCR
 * model download or OpenStreetMap was unavailable - never counted as passed).
 * Real-service checks: npm run test:supabase  and  npm run test:live
 */
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { launchBrowser, createContext } from "./lib/harness.mjs";
import { startMockAi, startMockOllama } from "./lib/mockServers.mjs";
import { makeFixtures } from "./lib/fixtures.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5199;
const AI_PORT = 5198;
const OLLAMA_PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}`;

const SUITES = ["core", "history", "insights", "reports", "ai", "tools", "stability", "proxy"];
const selected = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;

// Force device-only mode and the mock AI endpoint for this run (process env
// takes priority over .env in Vite).
process.env.VITE_SUPABASE_URL = "";
process.env.VITE_SUPABASE_ANON_KEY = "";
process.env.VITE_AI_FUNCTION_URL = `http://127.0.0.1:${AI_PORT}/api/explain-results`;

const online = await fetch("https://nominatim.openstreetmap.org/status", { signal: AbortSignal.timeout(5000) })
  .then((r) => r.ok)
  .catch(() => false);

const mockAi = await startMockAi(AI_PORT);
const mockOllama = await startMockOllama(OLLAMA_PORT);
const vite = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
});
await vite.listen();
const browser = await launchBrowser();
const fixture = await makeFixtures(browser, fileURLToPath(new URL("./.fixtures/", import.meta.url)));

let failed = 0;
let passed = 0;
let skipped = 0;
let consoleErrors = 0;
try {
  for (const id of selected) {
    const suite = await import(`./suites/${id}.mjs`);
    const t = createContext(browser, BASE);
    const started = Date.now();
    console.log(`\n=== ${suite.name} ===`);
    try {
      await suite.run(t, {
        browser,
        fixture,
        online,
        mockAi: `http://127.0.0.1:${AI_PORT}`,
        mockOllama: `http://127.0.0.1:${OLLAMA_PORT}`,
      });
    } catch (error) {
      t.check(`suite crashed: ${error instanceof Error ? error.message.split("\n")[0] : error}`, false);
    }
    for (const r of t.results) console.log(`${r.status.padEnd(4)}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
    for (const e of t.errors) console.log(`ERROR ${e}`);
    passed += t.results.filter((r) => r.status === "PASS").length;
    failed += t.results.filter((r) => r.status === "FAIL").length;
    skipped += t.results.filter((r) => r.status === "SKIP").length;
    consoleErrors += t.errors.length;
    console.log(`--- ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close();
  await vite.close();
  mockAi.close();
  mockOllama.close();
}

console.log(`\nE2E TOTAL: ${passed} passed, ${failed} failed, ${skipped} skipped, ${consoleErrors} browser console errors`);
process.exit(failed > 0 || consoleErrors > 0 ? 1 : 0);
