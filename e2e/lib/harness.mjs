// GlucoCare end-to-end test helpers (Playwright core + the installed Chrome/Edge).
import { chromium } from "playwright-core";

export async function launchBrowser() {
  const channels = [process.env.E2E_BROWSER_CHANNEL, "chrome", "msedge"].filter(Boolean);
  let lastError;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No Chrome or Edge found for end-to-end tests (${lastError?.message ?? ""}). Set E2E_BROWSER_CHANNEL.`);
}

/**
 * Test context shared by all suites.
 * check(name, ok)  -> PASS / FAIL
 * skip(name, why)  -> SKIP (external dependency unavailable - never counted as passed)
 */
export function createContext(browser, base) {
  const results = [];
  const errors = [];
  let allowedErrors = [];

  async function page(width = 1280, height = 900, contextOptions = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, ...contextOptions });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`[${width}] pageerror: ${e.message}`));
    p.on("console", (m) => {
      if (m.type() !== "error" || p.url().endsWith("favicon.svg")) return;
      const text = m.text();
      if (allowedErrors.some((a) => text.includes(a))) return;
      errors.push(`[${width}] console: ${text}`);
    });
    p.on("dialog", (d) => d.accept());
    return p;
  }

  /** Writes localStorage without running the app (static asset, same origin). */
  async function seed(p, entries = {}) {
    await p.goto(`${base}/favicon.svg`);
    await p.evaluate((e) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }, entries);
  }

  return {
    base,
    results,
    errors,
    page,
    seed,
    storage: (p, key) => p.evaluate((k) => localStorage.getItem(k), key),
    noOverflow: async (p) => (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0,
    check: (name, ok, extra = "") => results.push({ status: ok ? "PASS" : "FAIL", name, extra }),
    skip: (name, why) => results.push({ status: "SKIP", name, extra: why }),
    /** Console errors containing these strings are expected for the current step. */
    allowConsoleErrors: (list) => (allowedErrors = list),
    completeAssessment: (p, v) => completeAssessment(base, p, v),
  };
}

/** Drives the real assessment form and returns the saved assessment id. */
export async function completeAssessment(base, p, v) {
  await p.goto(`${base}/assessment`);
  if (v.name !== undefined) await p.getByLabel("Full Name (optional)").fill(v.name);
  if (v.age !== undefined) await p.getByLabel("Age").fill(v.age);
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  if (v.glucose !== undefined) await p.getByLabel("Blood Glucose").fill(v.glucose);
  if (v.glucoseContext) await p.getByLabel(/When was this glucose reading taken/).selectOption(v.glucoseContext);
  if (v.hba1c !== undefined) await p.getByLabel("HbA1c").fill(v.hba1c);
  if (v.height) await p.getByLabel("Height").fill(v.height);
  if (v.weight) await p.getByLabel("Weight").fill(v.weight);
  if (v.systolic) await p.getByLabel("Systolic").fill(v.systolic);
  if (v.diastolic) await p.getByLabel("Diastolic").fill(v.diastolic);
  for (const s of v.symptoms ?? []) await p.getByRole("button", { name: s, exact: true }).click();
  if (v.warning) await p.getByRole("button", { name: v.warning, exact: true }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  if (v.activity) await p.getByRole("button", { name: v.activity, exact: true }).click();
  if (v.diet) await p.getByRole("button", { name: v.diet, exact: true }).click();
  if (v.smoking) await p.getByRole("button", { name: v.smoking, exact: true }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  if (v.date) await p.getByLabel("Date of these measurements").fill(v.date);
  const btn = p.getByRole("button", { name: /Complete Assessment|Saving/ });
  if (v.doubleClick) await btn.dblclick();
  else await btn.click();
  await p.waitForURL(/\/results\/[0-9a-f-]{36}$/, { timeout: 30000 });
  return p.url().split("/").pop();
}
