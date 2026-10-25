// Phases 6-7: trends/charts and "What changed?".
export const name = "Trends and What Changed";

export async function run(t) {
  const card = (p, title) => p.locator("section[aria-label='Trends'] h3", { hasText: new RegExp(`^${title}$`) }).locator("xpath=..");
  const cmp = (p) => p.locator("section[aria-label='What changed']");

  const p = await t.page();
  await t.seed(p);
  await t.completeAssessment(p, { age: "52", glucose: "132", glucoseContext: "fasting", hba1c: "6.4", date: "2026-08-01" });
  await p.goto(`${t.base}/journey`);
  await p.getByText("How your recorded values have changed").waitFor();
  t.check("1 value: 'insufficient' message, no direction words", (await card(p, "HbA1c").getByText(/At least two are needed/).isVisible()) && !/increased|decreased/.test(await card(p, "HbA1c").innerText()));
  t.check("0 values: 'no trend available'", await card(p, "Weight").getByText("No values recorded yet - no trend available.").isVisible());
  t.check("compare: needs two assessments", (await cmp(p).innerText()).includes("Complete at least two assessments"));

  await t.completeAssessment(p, { glucose: "151", glucoseContext: "fasting", hba1c: "7.1", height: "170", weight: "79", date: "2026-09-01" });
  await t.completeAssessment(p, { glucose: "158", glucoseContext: "fasting", hba1c: "7.6", height: "170", weight: "78.3", date: "2026-10-01" });
  await t.completeAssessment(p, { glucose: "190", glucoseContext: "random", date: "2026-10-03" });
  await p.goto(`${t.base}/journey`);
  await p.getByText("How your recorded values have changed").waitFor();

  const hb = await card(p, "HbA1c").innerText();
  t.check("3 values: increase described with dates", hb.includes("Your recorded HbA1c values increased across your 3 measurements (6.4 % on 01 Aug 2026 to 7.6 % on 01 Oct 2026)."));
  t.check("interpretation separate, from existing ranges", /possible interpretation - reference range/i.test(hb) && hb.includes("The earliest value was borderline (prediabetes range); the latest is elevated"));
  t.check("not-a-diagnosis / no-prediction note", hb.includes("It is not a diagnosis and does not predict future values."));
  const g = await card(p, "Blood glucose").innerText();
  t.check("glucose contexts kept separate", g.includes("are not comparable") && g.includes("fasting blood glucose values increased across your 3 measurements") && g.includes("One random blood glucose value recorded"));
  t.check("no predictive language in trends", !/will (be|become|rise|fall|reach)|forecast|expected to|likely to|worsen|progression/i.test(await p.locator("section[aria-label='Trends']").innerText()));
  t.check("charts rendered", (await p.locator("section[aria-label='Trends'] svg .recharts-line").count()) >= 3);
  await card(p, "HbA1c").getByText("Show recorded values as a table").click();
  t.check("accessible data table lists the 3 HbA1c values", (await card(p, "HbA1c").locator("table tbody tr").count()) === 3);

  const opts = await cmp(p).getByLabel("Earlier assessment").locator("option").allInnerTexts();
  const aug = opts.find((o) => o.startsWith("01 Aug"));
  const sep = opts.find((o) => o.startsWith("01 Sep"));
  await cmp(p).getByLabel("Earlier assessment").selectOption({ label: aug });
  await cmp(p).getByLabel("Later assessment").selectOption({ label: sep });
  const c = await cmp(p).innerText();
  t.check("compare: HbA1c 6.4 -> 7.1, points 1 -> 3", /HbA1c\s+6\.4 %\s+7\.1 %\s+1 → 3/.test(c));
  t.check("compare: glucose value changed, same points", /Blood glucose\s+132 mg\/dL\s+151 mg\/dL\s+2 → 2/.test(c));
  t.check("compare: score change shown", (await cmp(p).getByLabel(/Score change \+/).count()) === 1);

  const m = await t.page(400);
  await m.goto(`${t.base}/favicon.svg`);
  await m.evaluate((v) => localStorage.setItem("glucocare-history-v1", v), await t.storage(p, "glucocare-history-v1"));
  await m.goto(`${t.base}/journey`);
  await m.getByText("How your recorded values have changed").waitFor();
  t.check("400px: charts + compare table do not overflow the page", await t.noOverflow(m));
}
