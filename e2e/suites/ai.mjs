// Phase 9 in the browser: evidence-only requests, guard, safety gate (mock AI endpoint).
export const name = "AI explanation (guarded, mock provider)";

export async function run(t, { mockAi }) {
  const ai = (p) => p.locator("section[aria-label='AI-assisted explanation']");
  const ctl = (path) => fetch(`${mockAi}${path}`).then((r) => r.text());

  await ctl("/mode/good");
  await ctl("/reset");
  const p = await t.page();
  await t.seed(p);
  await t.completeAssessment(p, { name: "Asha Kumar", age: "52", glucose: "156", glucoseContext: "fasting", hba1c: "6.8", date: "2026-09-01" });

  await ai(p).getByRole("button", { name: "Explain my results" }).click();
  await ai(p).getByText(/checked against your calculated result/).waitFor({ timeout: 20000 });
  const text = await ai(p).innerText();
  t.check("good reply shown, labelled as checked", /High concern indicator with a score of 6 out of 18/.test(text));
  t.check("factor explanations use GlucoCare's own labels", text.includes("HbA1c:") && text.includes("Blood glucose:"));
  const last = await ctl("/last");
  t.check("privacy: AI never receives name or exact age", !last.includes("Asha") && last.includes("50-59") && !/"age":"52"/.test(last));

  await ctl("/mode/attack");
  await p.reload();
  await ai(p).getByRole("button", { name: "Explain my results" }).click();
  await ai(p).getByText(/were removed because they did not/).waitFor({ timeout: 20000 });
  const ta = await ai(p).innerText();
  t.check("guard: medication sentence and invented factor removed", !/metformin|cholesterol/i.test(ta));

  await ctl("/mode/bad");
  await p.reload();
  await ai(p).getByRole("button", { name: "Explain my results" }).click();
  await ai(p).getByText("The AI response was not shown").waitFor({ timeout: 20000 });
  t.check("guard: mostly-bad reply blocked entirely", !/You have diabetes|metformin|nothing to worry/i.test(await ai(p).innerText()));
  t.check("deterministic result unchanged by AI", await p.getByRole("heading", { name: "High Concern" }).isVisible());

  await ctl("/mode/error");
  t.allowConsoleErrors(["502"]);
  await p.reload();
  await ai(p).getByRole("button", { name: "Explain my results" }).click();
  await ai(p).getByRole("alert").waitFor({ timeout: 20000 });
  t.check("provider error: friendly message + retry", ((await ai(p).innerText()).includes("busy right now")) && (await ai(p).getByRole("button", { name: "Try again" }).isVisible()));
  t.allowConsoleErrors([]);

  await ctl("/mode/good");
  await ctl("/reset");
  const u = await t.page();
  await t.seed(u);
  await t.completeAssessment(u, { glucose: "320", date: "2026-09-02" });
  await ai(u).getByText("AI explanation is unavailable while a safety warning is active").waitFor();
  t.check("urgent: AI never contacted", JSON.parse(await ctl("/count")).count === 0);

  await p.goto(`${t.base}/journey`);
  await ai(p).getByRole("button", { name: "Explain my results" }).click();
  await ai(p).getByText(/checked against your calculated result/).waitFor({ timeout: 20000 });
  t.check("Journey: AI explanation of the latest assessment", true);
}
