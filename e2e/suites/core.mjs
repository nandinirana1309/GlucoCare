// Phases 1-2: assessment form, explainable score, safety layer, AI safety gate.
export const name = "Core: assessment, explainable score, safety";

export async function run(t) {
  const why = (p) => p.locator('section[aria-label="Why am I seeing this result?"]');
  const banner = (p) => p.getByText("Seek medical care", { exact: true });
  const ai = (p) => p.locator("section[aria-label='AI-assisted explanation']");

  /* Normal assessment through the real form */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/`);
    await p.getByRole("link", { name: "Start Assessment" }).first().click();
    await p.waitForURL("**/assessment");
    await t.completeAssessment(p, { age: "52", glucose: "156", glucoseContext: "fasting", hba1c: "6.8", height: "170", weight: "78.3", systolic: "134", diastolic: "86", symptoms: ["Fatigue", "Blurred vision", "Excessive thirst"], date: "2026-09-01" });
    await why(p).waitFor();
    const w = await why(p).innerText();
    // age 1 + glucose 2 + HbA1c 3 + BP 1 + BMI 1 + 3 symptoms 1 = 9
    t.check("form -> results: score 9 of 18", /9\s*of 18 possible points/.test(w));
    t.check("breakdown: HbA1c +3, glucose +2, BMI 27.1", w.includes("6.8 %") && w.includes("+3 pts") && w.includes("156 mg/dL") && w.includes("+2 pts") && w.includes("27.1"));
    t.check("breakdown: provenance and not-provided group", w.includes("Source: Entered in your assessment") && /Not provided[\s\S]*Family history/.test(w));
    t.check("final level High (score >= 6)", await p.getByRole("heading", { name: "High Concern" }).isVisible());
    t.check("existing sections still render", (await p.getByRole("heading", { name: "Health measurements" }).isVisible()) && (await p.getByRole("heading", { name: "Recommendations", exact: true }).isVisible()));
    t.check("no safety banner for a normal assessment", (await banner(p).count()) === 0);
  }

  /* Score 0 but urgent: safety override */
  {
    const p = await t.page();
    await t.seed(p);
    await t.completeAssessment(p, { age: "30", warning: "Fainting or loss of consciousness", date: "2026-09-01" });
    await banner(p).waitFor();
    const w = await why(p).innerText();
    t.check("red flag: banner + reason visible", await p.getByText("You reported one or more serious warning signs.").first().isVisible());
    t.check("red flag: final level High", await p.getByRole("heading", { name: "High Concern" }).isVisible());
    t.check("red flag: score gains no points (0 of 18)", /0\s*of 18 possible points/.test(w));
    t.check("red flag: level basis shows safety override (score-only Low)", /on points alone it would be\s+Low/.test(w));
    t.check("red flag: AI blocked, no Explain button", (await ai(p).getByText("AI explanation is unavailable while a safety warning is active").isVisible()) && (await ai(p).getByRole("button", { name: "Explain my results" }).count()) === 0);
    const order = [await banner(p).boundingBox(), await p.getByRole("heading", { name: "High Concern" }).boundingBox(), await why(p).boundingBox(), await ai(p).boundingBox()].map((b) => b.y);
    t.check("hierarchy: safety -> level -> why -> AI", order[0] < order[1] && order[1] < order[2] && order[2] < order[3]);
  }

  /* Multiple red flags keep all evidence */
  {
    const p = await t.page();
    await t.seed(p);
    await t.completeAssessment(p, { glucose: "45", systolic: "185", diastolic: "125", warning: "Fruity-smelling breath", date: "2026-09-01" });
    await banner(p).waitFor();
    const evidence = ["Blood glucose entered: 45 mg/dL", "Blood pressure entered: 185/125 mmHg", "Warning signs reported: Fruity-smelling breath"];
    let all = true;
    for (const e of evidence) all = all && (await p.getByText(e).isVisible());
    t.check("multiple red flags: every rule's evidence shown", all);
  }

  /* Immediate warning-sign feedback on the form */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/assessment`);
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("button", { name: "Continue" }).click();
    const alert = p.getByRole("alert");
    await p.getByLabel("Blood Glucose").fill("45");
    t.check("form: typing a glucose value does not flash a live warning", (await alert.count()) === 0);
    const sign = p.getByRole("button", { name: "Severe abdominal pain", exact: true });
    await sign.click();
    await alert.waitFor();
    t.check("form: warning appears immediately and is announced", (await alert.innerText()).includes("Severe abdominal pain"));
    t.check("form: toggle button reports aria-pressed", (await sign.getAttribute("aria-pressed")) === "true");
    t.check("form: user can still continue", await p.getByRole("button", { name: "Continue" }).isEnabled());
    await sign.click();
    t.check("form: warning disappears when deselected", (await alert.count()) === 0);
  }

  /* Validation still blocks impossible values */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/assessment`);
    await p.getByLabel("Age").fill("400");
    t.check("validation: impossible age shows an error and blocks Continue", (await p.getByText(/between 1 and 120/).isVisible()) && (await p.getByRole("button", { name: "Continue" }).isDisabled()));
  }
}
