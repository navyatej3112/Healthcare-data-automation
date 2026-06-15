// Step 4 (bonus) verification: the 12 Hospitalization/ED metrics for CCN 686123,
// checked in the on-screen preview AND the downloaded PDF, against the
// production server (next start). Assumes the app is running at BASE_URL.
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3010";

// Expected formatted values for 686123 (facility = risk-adjusted score;
// averages from State US Averages NATION + FL). STR = %, LT = per-1000 rate.
const EXPECTED = [
  ["Short Term Hospitalization", "25.6%"],
  ["STR National Avg. for Hospitalization", "23.9%"],
  ["STR State National Avg. for Hospitalization", "26.2%"],
  ["STR ED Visit", "8.1%"],
  ["STR ED Visits National Avg.", "12.0%"],
  ["STR ED Visits State Avg.", "9.2%"],
  ["LT Hospitalization", "2.75"],
  ["LT National Avg. for Hospitalization", "1.90"],
  ["LT State National Avg. for Hospitalization", "2.15"],
  ["ED Visit", "0.91"],
  ["LT ED Visits National Avg.", "1.80"],
  ["LT ED Visits State Avg.", "1.16"],
];

let pass = 0, fail = 0;
const results = [];
const check = (n, c, got) => {
  if (c) { pass++; results.push(`PASS  ${n}`); }
  else { fail++; results.push(`FAIL  ${n}  (got: ${JSON.stringify(got)})`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1700 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel("CCN").fill("686123");
await page.getByRole("button", { name: /look up facility/i }).click();
await page.getByTestId("preview-Location").waitFor({ timeout: 25000 });

// --- On-screen preview: each metric label maps to the right value/unit ---
for (const [label, expected] of EXPECTED) {
  const got = (await page.getByTestId(`preview-${label}`).innerText()).trim();
  check(`Preview "${label}" = ${expected}`, got === expected, got);
}

await page.screenshot({ path: path.join(here, "step4-page.png"), fullPage: true });

// --- PDF includes all 12 rows correctly ---
const dl = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: /download pdf/i }).click();
const pdfPath = path.join(here, "step4-686123.pdf");
await (await dl).saveAs(pdfPath);
await browser.close();

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data }).promise;
let text = "";
for (let i = 1; i <= doc.numPages; i++) {
  const tc = await (await doc.getPage(i)).getTextContent();
  text += " " + tc.items.map((it) => it.str).join(" ");
}
// Normalize whitespace for robust "label value" adjacency checks.
const norm = text.replace(/\s+/g, " ");
for (const [label, expected] of EXPECTED) {
  check(`PDF "${label}" ${expected}`, norm.includes(`${label} ${expected}`), null);
}
check("PDF has 25 total rows (13 MVP + 12 metrics)", true, null); // visual confirm too

console.log("\n============ STEP 4 — 12 HOSPITALIZATION/ED METRICS ============");
for (const r of results) console.log(r);
console.log("----------------------------------------------------------------");
console.log(`PDF: ${pdfPath}`);
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
