// Phases 3-5 (device mode): history, draft vs history, deletion, migration, Journey.
export const name = "History, migration and My Health Journey";

export async function run(t) {
  const hist = async (p) => JSON.parse((await t.storage(p, "glucocare-history-v1")) ?? '{"assessments":[],"measurements":[],"reports":[]}');

  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/journey`);
    await p.getByText("Your journey starts with your first assessment").waitFor();
    t.check("journey: empty state, no invented data", (await p.getByText("Latest indicator").count()) === 0);
    t.check("journey: device-only mode label", await p.getByText("Saved on this device only").isVisible());
    t.check("nav: 'My Health' marked current", (await p.getByRole("link", { name: "My Health" }).getAttribute("aria-current")) === "page");

    const id1 = await t.completeAssessment(p, { name: "Local Name", age: "52", glucose: "132", glucoseContext: "fasting", hba1c: "6.4", height: "170", weight: "80", systolic: "128", diastolic: "82", activity: "Sedentary", date: "2026-08-01" });
    await p.getByText("Assessment of 01 Aug 2026").waitFor();
    t.check("saved assessment opens at /results/:id with date + saved badge", await p.getByText("Saved on this device").isVisible());

    await p.goto(`${t.base}/assessment`);
    const ageKept = await p.getByLabel("Age").inputValue();
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("button", { name: "Continue" }).click();
    t.check("new draft keeps profile, clears measurements", ageKept === "52" && (await p.getByLabel("Blood Glucose").inputValue()) === "");

    const id2 = await t.completeAssessment(p, { glucose: "151", glucoseContext: "fasting", hba1c: "7.1", height: "170", weight: "79", systolic: "130", diastolic: "84", date: "2026-09-01" });
    let h = await hist(p);
    const first = h.assessments.find((a) => a.id === id1);
    t.check("second assessment is separate; first unchanged", id2 !== id1 && h.assessments.length === 2 && first.input.glucose === "132");
    t.check("history stores no name or locality", h.assessments.every((a) => !("name" in a.input) && !("locality" in a.input)) && !JSON.stringify(h).includes("Local Name"));
    t.check("measurements + glucose context recorded", h.measurements.find((m) => m.assessmentId === id1 && m.kind === "glucose")?.glucoseContext === "fasting");

    await t.completeAssessment(p, { glucose: "158", glucoseContext: "fasting", hba1c: "7.6", height: "170", weight: "78.3", systolic: "134", diastolic: "86", date: "2026-10-01", doubleClick: true });
    h = await hist(p);
    t.check("double-click Complete saves exactly one record", h.assessments.length === 3);

    await p.goto(`${t.base}/journey`);
    await p.getByText("Latest indicator").waitFor();
    t.check("journey: stats show 3 assessments", await p.locator("section[aria-label='Key statistics']").getByText("3", { exact: true }).isVisible());
    t.check("journey: latest values with source labels", await p.getByText("Latest recorded values").locator("xpath=..").getByText(/Calculated/).isVisible());
    t.check("journey: timeline lists 3 months", (await p.getByText("Your recorded journey").locator("xpath=..").locator("section").count()) === 3);
    t.check("journey: assessment history lists 3", (await p.locator("section[aria-label='Assessment history'] li").count()) === 3);

    await p.goto(`${t.base}/results/${id2}`);
    await p.getByText("Assessment of 01 Sep 2026").waitFor();
    await p.getByRole("button", { name: "Delete this assessment" }).click();
    await p.waitForURL(`${t.base}/results`);
    h = await hist(p);
    t.check("delete one assessment removes it and only its measurements", h.assessments.length === 2 && !h.measurements.some((m) => m.assessmentId === id2));

    await p.getByRole("button", { name: "Clear my data" }).click();
    await p.getByText("No assessment found").waitFor();
    t.check("Clear my data removes history and draft", (await t.storage(p, "glucocare-history-v1")) === null && (await t.storage(p, "glucocare-assessment")) === null);
  }

  /* Legacy (pre-history) record migration */
  {
    const p = await t.page();
    await t.seed(p, { "glucocare-assessment": { name: "Legacy User", age: "58", glucose: "140", hba1c: "6.1", symptoms: [], warningSigns: [], locality: "Vellore" } });
    await p.goto(`${t.base}/results`);
    await p.getByText("An assessment from before health history was added").waitFor();
    t.check("legacy: offered, shown live as not saved", await p.getByText("Not saved to your history yet").isVisible());
    await p.getByLabel("Date of those measurements").fill("2026-08-01");
    await p.getByRole("button", { name: "Save to my history" }).click();
    await p.waitForURL(/\/results\/[0-9a-f-]{36}$/);
    const h = await hist(p);
    t.check("legacy: copied once, without name/locality", h.assessments.length === 1 && !JSON.stringify(h).match(/Legacy User|Vellore/));
    t.check("legacy: original copy kept (never deleted)", (await t.storage(p, "glucocare-legacy-assessment")) !== null);
    await p.reload();
    await p.getByText("Assessment of 01 Aug 2026").waitFor();
    t.check("legacy: not offered again after reload", (await p.getByText("An assessment from before").count()) === 0);
  }

  /* Unreadable history is never overwritten */
  {
    const p = await t.page();
    await t.seed(p, { "glucocare-history-v1": "{corrupt" });
    await p.goto(`${t.base}/results`);
    await p.getByText("Your history could not be loaded").waitFor();
    t.check("corrupt history: error + retry, data left untouched", (await p.getByRole("button", { name: "Try again" }).isVisible()) && (await t.storage(p, "glucocare-history-v1")) === "{corrupt");
  }
}
