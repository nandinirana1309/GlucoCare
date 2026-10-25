// Generates SYNTHETIC medical-report files (fictional data) for the report tests.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HTML = `<!doctype html><html><body style="font-family:Arial;padding:40px;color:#000;background:#fff;font-size:18px">
<h2>SAMPLE DIAGNOSTICS LABORATORY (synthetic test document)</h2>
<p>Patient Name: Test Patient &nbsp;&nbsp; Age/Sex: 52 Y / F</p>
<p>Collected On: 14/09/2026 08:10 &nbsp;&nbsp; Reported On: 14/09/2026 13:22</p>
<table cellpadding="6" style="border-collapse:collapse;font-size:18px">
<tr><th align="left">Test Name</th><th>Result</th><th>Unit</th><th>Bio. Ref. Interval</th></tr>
<tr><td>Glucose, Fasting (Plasma)</td><td>132</td><td>mg/dL</td><td>70 - 100</td></tr>
<tr><td>Glucose, Post Prandial (2 hr)</td><td>186</td><td>mg/dL</td><td>70 - 140</td></tr>
<tr><td>HbA1c (Glycated Haemoglobin)</td><td>7.1</td><td>%</td><td>4.0 - 5.6</td></tr>
<tr><td>Estimated Average Glucose (eAG)</td><td>157</td><td>mg/dL</td><td></td></tr>
</table>
<p>Blood Pressure: 134/86 mmHg</p>
<p>Weight: 78.3 kg &nbsp;&nbsp; Height: 170 cm &nbsp;&nbsp; BMI: 27.1 kg/m2</p>
</body></html>`;

export async function makeFixtures(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const f = (name) => join(dir, name);
  if (!existsSync(f("lab-report.pdf"))) {
    const p = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await p.setContent(HTML);
    await p.pdf({ path: f("lab-report.pdf"), format: "A4" });
    await p.screenshot({ path: f("lab-report.png"), fullPage: true });
    const png = readFileSync(f("lab-report.png")).toString("base64");
    await p.setContent(`<!doctype html><html><body style="margin:0"><img src="data:image/png;base64,${png}" style="width:100%"></body></html>`);
    await p.pdf({ path: f("scanned-report.pdf"), format: "A4" });
    await p.close();
  }
  writeFileSync(f("fake.pdf"), "This is not really a PDF document.");
  const big = Buffer.alloc(11 * 1024 * 1024, 0x20);
  big.write("%PDF-1.4\n");
  writeFileSync(f("too-big.pdf"), big);
  return f;
}
