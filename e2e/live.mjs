/**
 * LIVE check against the REAL services in .env:   npm run test:live
 * Start the app first in another terminal:        npm run dev:all
 *
 *  - Supabase: assessments really persist in the database (not localStorage)
 *  - Gemini (through server/ai-proxy.mjs): a real explanation passes the guard
 *  - secrets: the Gemini key never reaches the browser, storage or responses
 * The test cleans up its own cloud rows ("Clear my data") at the end.
 * Secrets are read from .env only to CHECK they never leak; never printed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchBrowser, createContext } from "./lib/harness.mjs";

const BASE = process.env.LIVE_BASE ?? "http://localhost:5173";
const PROXY = process.env.LIVE_PROXY ?? "http://localhost:8787/api/explain-results";
const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const GEMINI = env.GEMINI_API_KEY;

const up = await Promise.all([fetch(BASE).then((r) => r.ok).catch(() => false), fetch(PROXY.replace("/api/explain-results", "/health")).then((r) => r.ok).catch(() => false)]);
if (!up[0] || !up[1]) {
  console.error("Start the app first: npm run dev:all  (web on 5173 and AI proxy on 8787)");
  process.exit(2);
}
if (!env.VITE_SUPABASE_URL || !GEMINI) {
  console.error(".env must contain VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and GEMINI_API_KEY");
  process.exit(2);
}

const browser = await launchBrowser();
const t = createContext(browser, BASE);
const leaks = [];
const p = await t.page();
const requests = [];
p.on("request", (r) => requests.push(r.url()));
p.on("response", async (r) => {
  try {
    if ((await r.text()).includes(GEMINI)) leaks.push(r.url());
  } catch { /* binary */ }
});
const ai = p.locator("section[aria-label='AI-assisted explanation']");

try {
  // Browsing alone must not create a database user (anonymous sign-in happens on first save).
  {
    const browse = await t.page();
    const signups = [];
    browse.on("request", (r) => r.url().includes("/auth/v1/signup") && signups.push(r.url()));
    await t.seed(browse);
    for (const path of ["/", "/journey", "/results", "/education"]) {
      await browse.goto(`${BASE}${path}`);
      await browse.locator("h1").first().waitFor({ timeout: 30000 });
    }
    t.check("supabase: browsing without saving creates no user", signups.length === 0, `${signups.length} sign-ups`);
    t.check("supabase: empty journey for a new visitor", await browse.getByText("Your journey starts with your first assessment").isVisible().catch(() => false) || (await browse.goto(`${BASE}/journey`), await browse.getByText("Your journey starts with your first assessment").waitFor({ timeout: 30000 }).then(() => true).catch(() => false)));
    await browse.close();
  }

  await t.seed(p);
  const id = await t.completeAssessment(p, { age: "52", glucose: "156", glucoseContext: "fasting", hba1c: "6.8", height: "170", weight: "92", systolic: "134", diastolic: "86", activity: "Sedentary", date: "2026-10-01" });
  await p.getByText("Saved to your history").waitFor({ timeout: 30000 });
  const signups = requests.filter((u) => u.includes("/auth/v1/signup")).length;
  t.check("supabase: a new visitor gets exactly ONE anonymous sign-up", signups === 1, `${signups} sign-up requests`);
  t.check("supabase: saved through the save_assessment database function", requests.some((u) => u.includes("supabase.co/rest/v1/rpc/save_assessment")));
  const keys = await p.evaluate(() => Object.keys(localStorage));
  t.check("supabase: history is NOT kept in localStorage", !keys.includes("glucocare-history-v1"));
  t.check("supabase: anonymous session persisted", keys.some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
  await p.reload();
  await p.getByText("Assessment of 01 Oct 2026").waitFor({ timeout: 30000 });
  t.check("supabase: reload reads the assessment back from the database", true);

  await ai.getByRole("button", { name: "Explain my results" }).click();
  const outcome = await Promise.race([
    ai.getByText(/checked against your calculated result/).waitFor({ timeout: 120000 }).then(() => "shown"),
    ai.getByText("The AI response was not shown").waitFor({ timeout: 120000 }).then(() => "blocked-by-guard"),
    ai.getByRole("alert").waitFor({ timeout: 120000 }).then(() => "error"),
  ]).catch(() => "timeout");
  const text = await ai.innerText();
  if (outcome === "error" && /busy right now/.test(text)) {
    t.skip("gemini: real explanation", "Gemini reported it is busy (HTTP 429/503) - try again later");
  } else {
    t.check("gemini: real explanation generated and passed the guard", outcome === "shown", outcome);
    if (outcome === "shown") {
      t.check("gemini: no diagnosis, medication or dose", !/you have diabetes|you are diabetic|diagnosed with|metformin|insulin dose|\d+\s?mg\b(?!\/)|prescri/i.test(text));
      t.check("gemini: deterministic level unchanged", await p.getByRole("heading", { name: "High Concern" }).isVisible());
    }
  }
  // Optional AI overview on the doctor summary, with real Gemini output
  await p.goto(`${BASE}/journey/summary`);
  await p.locator("article[aria-label='Health summary']").waitFor({ timeout: 30000 });
  await p.getByRole("button", { name: /Add a plain-language AI overview/ }).click();
  const ov = await Promise.race([
    p.locator("section[aria-label='AI overview']").waitFor({ timeout: 120000 }).then(() => "added"),
    p.getByText(/did not pass GlucoCare's safety checks/).waitFor({ timeout: 120000 }).then(() => "refused-by-guard"),
    p.getByText(/busy right now|could not|took too long/i).waitFor({ timeout: 120000 }).then(() => "provider-error"),
  ]).catch(() => "timeout");
  if (ov === "provider-error") t.skip("gemini: doctor-summary AI overview", "Gemini busy");
  else t.check("gemini: doctor-summary AI overview handled safely (added or refused by the guard)", ov === "added" || ov === "refused-by-guard", ov);
  if (ov === "added") {
    const text = await p.locator("section[aria-label='AI overview']").innerText();
    t.check("gemini: overview contains no diagnosis or treatment advice", !/you have diabetes|you are diabetic|diagnosed with|metformin|prescri|\d+\s?mg\b(?!\/)/i.test(text));
  }

  const storage = await p.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  t.check("secret: Gemini key not in browser storage", !storage.includes(GEMINI));

  const res = await fetch(PROXY, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" }, body: JSON.stringify({ task: "explain-assessment", promptVersion: "2.0", evidence: { assessment: { concernLevel: "Low", levelBasis: "score", score: 0, maxScore: 18, thresholds: { moderate: 3, high: 6 } }, factors: [], safety: { urgent: true }, changes: null, trends: [], context: {} } }) });
  t.check("proxy: urgent evidence refused before calling Gemini", res.status === 422);

  void id;
} finally {
  // remove the cloud rows this test created
  await p.goto(`${BASE}/results`);
  const clear = p.getByRole("button", { name: "Clear my data" });
  if (await clear.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) {
    await clear.click();
    await p.getByText("No assessment found").waitFor({ timeout: 30000 }).catch(() => {});
  }
  t.check("cleanup: test data deleted from Supabase", (await p.getByText("No assessment found").count()) === 1);
  t.check("secret: key never seen in any network response", leaks.length === 0, leaks.join(", "));
  await browser.close();
}

for (const r of t.results) console.log(`${r.status.padEnd(4)}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
for (const e of t.errors) console.log(`ERROR ${e}`);
const failed = t.results.filter((r) => r.status === "FAIL").length;
console.log(`\nLIVE TOTAL: ${t.results.filter((r) => r.status === "PASS").length} passed, ${failed} failed, ${t.results.filter((r) => r.status === "SKIP").length} skipped`);
process.exit(failed > 0 || t.errors.length > 0 ? 1 : 0);
