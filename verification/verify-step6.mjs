// Step 6 (bonus) verification: on-page metric visuals.
// 686123 = full data (4 rating cards + 4 comparison charts with values);
// 015014 = some suppressed metrics (graceful "Facility value not reported",
// no broken bars). Runs against the production server (next start).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3010";

let pass = 0, fail = 0;
const results = [];
const check = (n, c, got) => {
  if (c) { pass++; results.push(`PASS  ${n}`); }
  else { fail++; results.push(`FAIL  ${n}  (got: ${JSON.stringify(got)})`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

async function lookup(ccn) {
  await page.getByLabel("CCN").fill(ccn);
  await page.getByRole("button", { name: /look up facility/i }).click();
  await page.getByTestId("preview-Location").waitFor({ timeout: 25000 });
  await page.getByTestId("metrics-visuals").waitFor({ timeout: 10000 });
}

// ---- 686123: full data ----
await page.goto(BASE, { waitUntil: "networkidle" });
await lookup("686123");

check("Visuals section renders", await page.getByTestId("metrics-visuals").isVisible(), null);

// 4 star-rating cards with values
const ratingCards = {
  Overall: "5", "Health Inspection": "5", Staffing: "2", "Quality of Resident Care": "5",
};
for (const [label, val] of Object.entries(ratingCards)) {
  const t = (await page.getByTestId(`rating-card-${label}`).innerText()).replace(/\s+/g, " ");
  check(`Rating card "${label}" shows ${val} / 5`, t.includes(`${val} / 5`), t);
}

// 4 comparison charts present, each showing facility + national + state value labels
const groups = [
  ["Short-Stay Hospitalization", ["25.6%", "23.9%", "26.2%"]],
  ["Short-Stay ED Visit", ["8.1%", "12.0%", "9.2%"]],
  ["Long-Stay Hospitalization", ["2.75", "1.90", "2.15"]],
  ["Long-Stay ED Visit", ["0.91", "1.80", "1.16"]],
];
for (const [title, vals] of groups) {
  const card = page.getByTestId(`viz-card-${title}`);
  check(`Chart card "${title}" visible`, await card.isVisible(), null);
  const t = await card.innerText();
  for (const v of vals) check(`  "${title}" shows ${v}`, t.includes(v), t);
  // Bars rendered (Recharts draws one .recharts-bar-rectangle group per bar)
  const bars = await card.locator(".recharts-bar-rectangle").count();
  check(`  "${title}" rendered ${bars} bar(s)`, bars >= 3, bars);
}
check("No client-side error (686123)", errs.length === 0, errs);
await page.screenshot({ path: path.join(here, "step6-686123.png"), fullPage: true });

// ---- 015014: suppressed short-stay metrics ----
errs.length = 0;
await page.goto(BASE, { waitUntil: "networkidle" });
await lookup("015014");

// STR Hospitalization & STR ED are footnoted -> facility omitted, caption shown,
// national/state still plotted; no broken/zero facility bar.
for (const title of ["Short-Stay Hospitalization", "Short-Stay ED Visit"]) {
  const card = page.getByTestId(`viz-card-${title}`);
  const caption = await page
    .getByTestId(`viz-missing-${title}`)
    .innerText()
    .catch(() => "");
  check(`Suppressed "${title}" shows "Facility value not reported"`,
    /facility value not reported/i.test(caption), caption);
  const t = await card.innerText();
  // Facility bar omitted: the card should still show National/State context and
  // must not crash. (No assertion on a facility number here.)
  check(`"${title}" still renders national/state context`, t.includes("National") || t.includes("State"), t);
}
// Long-stay still has data for 015014
const lt = page.getByTestId("viz-card-Long-Stay Hospitalization");
check("Long-Stay Hospitalization still shows data for 015014",
  (await lt.innerText()).includes("Facility"), null);
check("No client-side error (015014)", errs.length === 0, errs);
await page.screenshot({ path: path.join(here, "step6-015014.png"), fullPage: true });

await browser.close();

console.log("\n============ STEP 6 — METRIC VISUALS ============");
for (const r of results) console.log(r);
console.log("-------------------------------------------------");
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
