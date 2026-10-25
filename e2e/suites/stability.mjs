// Every route at desktop and 400px, navigation, keyboard focus, existing pages.
export const name = "Routes, responsiveness, accessibility, existing pages";

const ROUTES = ["/", "/assessment", "/results", "/journey", "/journey/summary", "/journey/scenarios", "/reports/new", "/education", "/nutrition", "/food", "/healthcare", "/hospitals", "/does-not-exist"];

export async function run(t, { online }) {
  for (const width of [1280, 820, 400]) {
    const p = await t.page(width);
    await t.seed(p);
    await t.completeAssessment(p, { age: "52", glucose: "156", hba1c: "6.8", height: "170", weight: "92", date: "2026-10-01" });
    const bad = [];
    for (const r of ROUTES) {
      await p.goto(`${t.base}${r}`);
      const ok = await p.locator("h1").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      if (!ok || !(await t.noOverflow(p))) bad.push(r);
    }
    t.check(`${width}px: all ${ROUTES.length} routes render without horizontal overflow`, bad.length === 0, bad.join(", "));
  }

  const p = await t.page();
  await p.goto(`${t.base}/does-not-exist`);
  t.check("unknown route shows Not Found", await p.getByText(/not found|404/i).first().isVisible());
  await p.goto(`${t.base}/food`);
  t.check("legacy /food link highlights Nutrition", (await p.getByRole("link", { name: "Nutrition" }).getAttribute("aria-current")) === "page");

  // Keyboard: Tab reaches the nav and shows a visible focus ring.
  await p.goto(`${t.base}/`);
  await p.keyboard.press("Tab");
  const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  t.check("keyboard: first Tab focuses a link with a visible focus ring", (await p.evaluate(() => document.activeElement?.tagName)) === "A" && outline !== "none");

  // Mobile menu
  const m = await t.page(400);
  await m.goto(`${t.base}/`);
  await m.getByRole("button", { name: "Open menu" }).click();
  t.check("400px: mobile menu opens with all links", (await m.locator("#mobile-menu a").count()) === 6 && (await m.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")) === "true");

  // Healthcare finder (live OpenStreetMap)
  if (!online) {
    t.skip("healthcare finder search", "offline");
    return;
  }
  // Public OpenStreetMap servers sometimes fail without CORS headers when
  // overloaded; the browser logs that. Expected for THIS step only.
  t.allowConsoleErrors(["overpass", "nominatim", "photon", "Failed to load resource", "Gateway"]);
  await p.goto(`${t.base}/healthcare`);
  await p.getByPlaceholder(/City or locality/).fill("Vellore, Tamil Nadu");
  await p.getByRole("button", { name: /Search/ }).click();
  const outcome = await Promise.race([
    p.getByText(/OpenStreetMap contributors/).waitFor({ timeout: 150000 }).then(() => "results"),
    p.getByText(/busy right now|Could not find|Something went wrong/).waitFor({ timeout: 150000 }).then(() => "service-error"),
  ]).catch(() => "timeout");
  if (outcome === "results") t.check("healthcare finder: live OpenStreetMap search", true);
  else {
    t.skip("healthcare finder: live OpenStreetMap search", `public service unavailable (${outcome})`);
    if (outcome === "service-error") t.check("healthcare finder: outage handled with a clear message", true);
  }
  await p.close();
  t.allowConsoleErrors([]);
}
