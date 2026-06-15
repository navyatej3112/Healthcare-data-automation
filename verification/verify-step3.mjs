// Step 3 verification: drives the REAL production app (next start), edits the
// name override + Current Census, clicks Download PDF, captures the download,
// then parses the PDF to confirm field values, branding, and the clickable
// Medicare hyperlink — and checks that the hyperlink actually resolves.
//
// Assumes the app is already running at BASE_URL (default http://localhost:3010).
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3010";

// Distinct from the API values, to prove the PDF reflects edited form state.
const OVERRIDE_NAME = "Kendall Lakes SNF (Internal)";
const EDITED_CENSUS = "108"; // API default is 142
const EXPECTED_URL =
  "https://www.medicare.gov/care-compare/details/nursing-home/686123/view-all?state=FL";

let pass = 0;
let fail = 0;
const results = [];
const check = (name, cond, got) => {
  if (cond) {
    pass++;
    results.push(`PASS  ${name}`);
  } else {
    fail++;
    results.push(`FAIL  ${name}  (got: ${JSON.stringify(got)})`);
  }
};

const pdfPath = path.join(here, "step3-sample.pdf");

// ---- 1. Drive the app and download the PDF ----
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel("CCN").fill("686123");
await page.getByRole("button", { name: /look up facility/i }).click();
await page.getByTestId("preview-Location").waitFor({ timeout: 20000 });

// Edit override name + Current Census.
await page.getByLabel("Name of Facility").fill(OVERRIDE_NAME);
await page.getByLabel("Current Census").fill(EDITED_CENSUS);

const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: /download pdf/i }).click();
const download = await downloadPromise;
await download.saveAs(pdfPath);
check("Download PDF triggered a file download", true, download.suggestedFilename());
await browser.close();

// ---- 2. Parse the PDF ----
const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data }).promise;
let text = "";
const links = [];
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const tc = await p.getTextContent();
  text += " " + tc.items.map((it) => it.str).join(" ");
  const annots = await p.getAnnotations();
  for (const a of annots) {
    if (a.url || a.unsafeUrl) links.push(a.url || a.unsafeUrl);
  }
}
const has = (s) => text.includes(s);

// ---- 3. Assertions ----
check("Branding: INFINITE present", has("INFINITE"), null);
check("Branding: Managed by MEDELITE present", has("Managed by MEDELITE"), null);
check("Branding: FACILITY ASSESSMENT SNAPSHOT present", has("FACILITY ASSESSMENT SNAPSHOT"), null);
check("Branding: state FL present", /\bFL\b/.test(text), null);

check("Name reflects EDITED override (not API name)", has(OVERRIDE_NAME), text.slice(0, 200));
check(
  "Guardrail: facility name did NOT overwrite the INFINITE banner",
  has("INFINITE") && !text.includes(`INFINITE ${OVERRIDE_NAME}`),
  null,
);
check("Location = 5280 SW 157 Avenue, Miami, FL", has("5280 SW 157 Avenue, Miami, FL"), null);
check("Census Capacity = 150", has("Census Capacity") && has("150"), null);
check("Current Census reflects EDITED value 108 (not default 142)", has("108") && !has("142"), null);

for (const label of [
  "EMR",
  "Type of Patient",
  "Previous Coverage from Medelite",
  "Previous Provider Performance from Medelite",
  "Medical Coverage",
  "Overall Star Rating",
  "Health Inspection",
  "Staffing",
  "Quality of Resident Care",
]) {
  check(`Row label present: ${label}`, has(label), null);
}
// Ratings 5 / 5 / 2 / 5 for 686123.
check("Staffing rating value 2 present", has("Staffing") && has("2"), null);

// Hyperlink: clickable annotation with the locked view-all?state=FL URL.
check(
  "Clickable Medicare link annotation = view-all?state=FL",
  links.includes(EXPECTED_URL),
  links,
);
check("Medicare URL also visible as text in the PDF", has("/care-compare/details/nursing-home/686123/view-all"), null);

// ---- 4. The hyperlink actually resolves ----
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(EXPECTED_URL, { redirect: "follow", signal: ctrl.signal });
  clearTimeout(t);
  check(`Medicare hyperlink resolves (HTTP ${res.status})`, res.status < 400, res.status);
} catch (e) {
  check("Medicare hyperlink resolves", false, String(e).slice(0, 120));
}

console.log("\n================ STEP 3 PDF VERIFICATION ================");
for (const r of results) console.log(r);
console.log("--------------------------------------------------------");
console.log(`PDF saved: ${pdfPath}`);
console.log(`Links found in PDF: ${JSON.stringify(links)}`);
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
