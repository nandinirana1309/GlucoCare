// Phases 10-12: personalised education, doctor summary, What-If simulator.
export const name = "Education, doctor summary, What-If";

export async function run(t, { browser, mockAi }) {
  const ctl = (path) => fetch(`${mockAi}${path}`).then((r) => r.text());
  const reading = (p) => p.locator("section[aria-label='Recommended reading for you']");
  const sheet = (p) => p.locator("article[aria-label='Health summary']");
  const scen = (p) => p.locator("section[aria-label='Scenario result']");

  /* Education */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/education`);
    await p.locator("#symptoms").waitFor();
    t.check("education: unchanged when there is no history", (await p.getByText("Recommended from your latest assessment").count()) === 0);
    await t.completeAssessment(p, { glucose: "160", activity: "Sedentary", date: "2026-09-01" });
    await reading(p).waitFor();
    const titles = await reading(p).locator("h3").allInnerTexts();
    t.check("education: glucose + activity content ranked first", titles.includes("Fasting and non-fasting glucose readings") && titles.includes("Moving more, safely"));
    t.check("education: 'Shown because' quotes the data", (await reading(p).innerText()).includes("Physical activity: Sedentary (+1 point)"));
    await reading(p).getByRole("link", { name: "Lifestyle and diabetes" }).click();
    await p.waitForURL("**/education#lifestyle");
    await p.waitForTimeout(800);
    const top = await p.locator("#lifestyle").evaluate((el) => el.getBoundingClientRect().top);
    t.check("education: link scrolls to the section", top >= 0 && top < 300);
    await p.goto(`${t.base}/nutrition`);
    const strip = p.getByText("Recommended from your latest assessment").locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
    await strip.waitFor();
    t.check("nutrition: only nutrition / activity / weight topics", (await strip.locator("h3").allInnerTexts()).every((x) => /plate|weight|Moving|Sugary|Salt/i.test(x)));
  }

  /* Doctor summary */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(`${t.base}/favicon.svg`);
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${t.base}/journey/summary`);
    await p.getByText("Complete an assessment first").waitFor();
    t.check("summary: empty state", (await sheet(p).count()) === 0);
    await t.completeAssessment(p, { name: "Test Person", age: "52", glucose: "132", glucoseContext: "fasting", hba1c: "6.4", date: "2026-08-01" });
    await t.completeAssessment(p, { glucose: "151", glucoseContext: "fasting", hba1c: "7.1", date: "2026-09-01" });
    await t.completeAssessment(p, { glucose: "158", glucoseContext: "fasting", hba1c: "7.6", date: "2026-10-01" });
    await p.goto(`${t.base}/journey`);
    await p.getByRole("link", { name: "Generate doctor summary" }).click();
    await sheet(p).waitFor();
    const s = await sheet(p).innerText();
    t.check("summary: labelled user-generated", s.includes("User-generated health summary for discussion with a healthcare professional."));
    t.check("summary: values, trend and changes traceable", s.includes("7.6 % (+3)") && /increased across your 3 measurements/.test(s) && s.includes("HbA1c: 7.1 % → 7.6 %"));
    t.check("summary: name excluded by default, no diagnosis/treatment", !s.includes("Test Person") && !/you have diabetes|diagnosed with|metformin|prescri/i.test(s));
    await p.getByRole("button", { name: "Copy as text" }).click();
    await p.getByRole("button", { name: "Copied" }).waitFor();
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    t.check("summary: copy puts plain text on the clipboard", clip.startsWith("GLUCOCARE - HEALTH SUMMARY") && clip.includes("1. My recorded HbA1c"));
    // Optional AI overview (Phase 11 option) - guarded, facts unchanged
    await ctl("/mode/good");
    const factsBefore = await sheet(p).locator("section:not([aria-label='AI overview'])").allInnerTexts();
    await p.getByRole("button", { name: /Add a plain-language AI overview/ }).click();
    await sheet(p).locator("section[aria-label='AI overview']").waitFor({ timeout: 20000 });
    const overview = await sheet(p).locator("section[aria-label='AI overview']").innerText();
    t.check("summary: AI overview added, clearly labelled as AI-assisted and checked", /AI-assisted, automatically checked/i.test(overview) && /High concern indicator/.test(overview));
    t.check("summary: AI overview leaves every factual section unchanged", JSON.stringify(await sheet(p).locator("section:not([aria-label='AI overview'])").allInnerTexts()) === JSON.stringify(factsBefore));
    await p.getByRole("button", { name: /Copy as text|Copied/ }).click();
    t.check("summary: copied text includes the labelled overview", (await p.evaluate(() => navigator.clipboard.readText())).includes("PLAIN-LANGUAGE OVERVIEW (AI-ASSISTED"));
    await p.getByRole("button", { name: "Remove the AI overview" }).click();
    t.check("summary: AI overview can be removed", (await sheet(p).locator("section[aria-label='AI overview']").count()) === 0);
    await ctl("/mode/bad");
    await p.getByRole("button", { name: /Add a plain-language AI overview/ }).click();
    await p.getByText("did not pass GlucoCare's safety checks, so it was not added").waitFor({ timeout: 20000 });
    t.check("summary: unsafe AI overview is refused", (await sheet(p).locator("section[aria-label='AI overview']").count()) === 0);
    await ctl("/mode/good");

    await p.getByLabel(/Include my name/).check();
    t.check("summary: name only when chosen", (await sheet(p).innerText()).includes("Test Person"));
    await p.emulateMedia({ media: "print" });
    t.check("summary: print hides app chrome, keeps the sheet", !(await p.locator("nav[aria-label='Main']").isVisible()) && (await sheet(p).isVisible()));
    t.check("summary: PDF can be produced", (await p.pdf({ format: "A4" })).length > 10000);
    await ctx.close();
  }

  /* Urgent safety: no AI overview offered */
  {
    const p = await t.page();
    await t.seed(p);
    await t.completeAssessment(p, { glucose: "320", date: "2026-10-01" });
    await p.goto(`${t.base}/journey/summary`);
    await sheet(p).waitFor();
    t.check("summary: no AI overview offered while safety is urgent", (await p.getByRole("button", { name: /AI overview/ }).count()) === 0);
  }

  /* What-If */
  {
    const p = await t.page();
    await t.seed(p);
    await t.completeAssessment(p, { age: "52", glucose: "156", glucoseContext: "fasting", hba1c: "6.8", height: "170", weight: "92", activity: "Sedentary", date: "2026-10-01" });
    await p.goto(`${t.base}/journey`);
    await p.getByRole("link", { name: "Explore a scenario" }).click();
    await scen(p).waitFor();
    const before = await p.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    t.check("what-if: labelled as not a prediction", (await p.getByText("Educational scenario - not a prediction.").count()) >= 2);
    await p.getByLabel("Physical activity").selectOption("Moderately active");
    await p.getByText("In this scenario, Physical activity would no longer add 1 point to the indicator.").waitFor();
    await p.getByLabel("Hypothetical weight (kg)").fill("70");
    await p.getByText(/Hypothetical BMI: 24\.2/).waitFor();
    const txt = await scen(p).innerText();
    t.check("what-if: BMI factor change explained", txt.includes("In this scenario, BMI would no longer add 2 points to the indicator."));
    t.check("what-if: measurements kept as recorded, no predictions", txt.includes("Blood glucose: 156 mg/dL (kept)") && !/will (drop|fall|improve|become)|your (glucose|hba1c) would/i.test(txt));
    await p.getByLabel("Hypothetical weight (kg)").fill("4000");
    t.check("what-if: invalid hypothetical weight rejected", await p.getByText(/between 10 and 400/).isVisible());
    await p.getByRole("button", { name: "Reset" }).click();
    t.check("what-if: reset restores the recorded profile", (await scen(p).innerText()).includes("No answers have been changed yet"));
    t.check("what-if: nothing saved", (await p.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))) === before);
  }
}
