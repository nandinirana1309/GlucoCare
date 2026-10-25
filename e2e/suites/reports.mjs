// Phase 8: medical report reading, review, privacy, OCR.
export const name = "Medical reports";

export async function run(t, { fixture }) {
  const rowsOf = (p) => p.locator("section[aria-label='Review extracted values'] ul.mt-5 > li");
  const upload = (p, f) => p.locator("input[type=file]").setInputFiles(fixture(f));

  /* PDF with a text layer: review and save */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/reports/new`);
    await upload(p, "lab-report.pdf");
    await p.getByText("Check each value").waitFor({ timeout: 90000 });
    t.check("PDF: 8 candidate values found", (await rowsOf(p).count()) === 8);
    const vals = await p.locator("input[type=number]").evaluateAll((els) => els.map((e) => e.value));
    t.check("PDF: reference ranges and eAG are not read as results", !vals.some((v) => ["157", "70", "100", "140", "5.6"].includes(v)));
    t.check("PDF: report date read", (await p.getByLabel("Date of the report").inputValue()) === "2026-09-14");
    t.check("PDF: nothing is trusted until reviewed", (await p.getByText("Extracted - not yet checked").count()) === 8 && (await p.getByRole("button", { name: /Save .* to my history/ }).isDisabled()));

    const fasting = rowsOf(p).filter({ has: p.getByText("Blood glucose", { exact: true }) }).first();
    await fasting.getByLabel(/Value \(mg\/dL\)/).fill("130");
    await fasting.getByRole("button", { name: "Confirm edited value" }).click();
    await rowsOf(p).filter({ has: p.getByText("Weight", { exact: true }) }).getByRole("button", { name: "Reject" }).click();
    const n = await rowsOf(p).count();
    for (let i = 0; i < n; i++) {
      const row = rowsOf(p).nth(i);
      const rejected = (await row.getByRole("button", { name: /reject/i }).getAttribute("aria-pressed")) === "true";
      const btn = row.getByRole("button", { name: /^Confirm/ });
      if (!rejected && (await btn.getAttribute("aria-pressed")) !== "true" && (await btn.isEnabled())) await btn.click();
    }
    await p.getByLabel("Name for this report").fill("September lab tests");
    await p.getByRole("button", { name: "Save 7 verified values to my history" }).click();
    await p.getByText("Report saved").waitFor();
    const raw = await t.storage(p, "glucocare-history-v1");
    const h = JSON.parse(raw);
    const g = h.reports[0].values.find((v) => v.kind === "glucose");
    const w = h.reports[0].values.find((v) => v.kind === "weight");
    t.check("saved: edited value keeps extracted 132 and final 130", g.status === "edited" && g.extractedValue === 132 && g.finalValue === 130);
    t.check("saved: rejected value keeps no numbers and is not a measurement", w.status === "rejected" && w.extractedValue === null && !h.measurements.some((m) => m.kind === "weight"));
    t.check("saved: 7 measurements dated with the report date", h.measurements.length === 7 && h.measurements.every((m) => m.measuredOn === "2026-09-14" && m.source === "report"));
    t.check("privacy: no report text, patient name or file name stored", !/Test Patient|SAMPLE DIAGNOSTICS|lab-report|Bio\. Ref/.test(raw));

    await p.getByRole("button", { name: "View my health journey" }).click();
    await p.getByRole("heading", { name: "Reports in your history" }).waitFor();
    t.check("journey: report listed with review counts", await p.getByText(/confirmed · 1 edited · 0 added · 1 rejected/).isVisible());
    await p.getByRole("button", { name: /Delete report September lab tests/ }).click();
    await p.getByText("Your journey starts with your first assessment").waitFor();
    t.check("delete report removes it and its measurements", JSON.parse(await t.storage(p, "glucocare-history-v1")).measurements.length === 0);
  }

  /* Invalid files */
  {
    const p = await t.page();
    await p.goto(`${t.base}/reports/new`);
    await upload(p, "fake.pdf");
    await p.getByRole("alert").waitFor();
    t.check("fake PDF rejected by magic bytes", /not a valid PDF, PNG or JPG/.test(await p.getByRole("alert").innerText()));
    await upload(p, "too-big.pdf");
    await p.getByText(/too large/).waitFor();
    t.check("oversized file rejected", true);
  }

  /* Manual entry + safety pre-check */
  {
    const p = await t.page();
    await t.seed(p);
    await p.goto(`${t.base}/reports/new`);
    await p.getByRole("button", { name: /enter values from a report by hand/ }).click();
    await p.getByRole("button", { name: "Add value" }).click();
    await rowsOf(p).first().getByLabel(/Value/).fill("320");
    await p.getByRole("alert").filter({ hasText: "Seek medical care" }).waitFor();
    t.check("safety warning for a dangerous report value", (await p.getByText("The blood glucose value on this report is very high (300 mg/dL or above).").count()) === 1);
    await rowsOf(p).first().getByLabel(/Value/).fill("140");
    await rowsOf(p).first().getByRole("button", { name: "Confirm", exact: true }).click();
    t.check("manual: report date is required", await p.getByRole("button", { name: /Save 1 verified value/ }).isDisabled());
    await p.getByLabel("Date of the report").fill("2026-07-10");
    await p.getByRole("button", { name: /Save 1 verified value/ }).click();
    await p.getByText("Report saved").waitFor();
    const h = JSON.parse(await t.storage(p, "glucocare-history-v1"));
    t.check("manual: saved as user-added", h.reports[0].extractionMethod === "manual_only" && h.measurements[0].verification === "report_added");
  }

  /* OCR (downloads the Tesseract model from a CDN the first time) */
  {
    const p = await t.page();
    await p.goto(`${t.base}/reports/new`);
    await upload(p, "lab-report.png");
    const outcome = await Promise.race([
      p.getByText("Check each value").waitFor({ timeout: 180000 }).then(() => "review"),
      p.getByText(/OCR engine could not be loaded/).waitFor({ timeout: 180000 }).then(() => "unavailable"),
    ]).catch(() => "timeout");
    if (outcome !== "review") {
      t.skip("OCR (PNG)", `OCR engine not available (${outcome}) - needs internet the first time`);
    } else {
      const vals = await p.locator("input[type=number]").evaluateAll((els) => els.map((e) => e.value));
      t.check("OCR (PNG): HbA1c 7.1 and fasting glucose 132 read", vals.includes("7.1") && vals.includes("132"), `(${vals.join(",")})`);
      t.check("OCR (PNG): never high confidence", (await p.getByText("high confidence").count()) === 0);
      await p.goto(`${t.base}/reports/new`);
      await upload(p, "scanned-report.pdf");
      await p.getByText("Check each value").waitFor({ timeout: 180000 });
      const v2 = await p.locator("input[type=number]").evaluateAll((els) => els.map((e) => e.value));
      t.check("OCR (scanned PDF): HbA1c 7.1 read", v2.includes("7.1"));
    }
  }
}
