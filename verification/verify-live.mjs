// Verifies the LIVE production deployment: render + field mapping + header state,
// then downloads the PDF from the live site and parses it.
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "https://healthcare-data-automation.vercel.app";
const EXPECTED_URL =
  "https://www.medicare.gov/care-compare/details/nursing-home/686123/view-all?state=FL";

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, got) => {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}  (got: ${JSON.stringify(got)})`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel("CCN").fill("686123");
await page.getByRole("button", { name: /look up facility/i }).click();
await page.getByTestId("preview-Location").waitFor({ timeout: 25000 });

// Header state
const headerText = await page.locator("header").innerText();
check("Header shows state FL", /\bFL\b/.test(headerText), headerText);
check("Header banner INFINITE — Managed by MEDELITE", /INFINITE\s+—\s+Managed by MEDELITE/.test(headerText), headerText);

// Default mapped values (no edits)
const val = async (label) => (await page.getByTestId(`preview-${label}`).innerText()).trim();
check("Name = Kendall Lakes Healthcare and Rehab Center",
  (await page.getByLabel("Name of Facility").inputValue()) === "Kendall Lakes Healthcare and Rehab Center");
check("Location = 5280 SW 157 Avenue, Miami, FL", (await val("Location")) === "5280 SW 157 Avenue, Miami, FL", await val("Location"));
check("Census Capacity = 150", (await val("Census Capacity")) === "150", await val("Census Capacity"));
check("Current Census default = 142", (await page.getByLabel("Current Census").inputValue()) === "142");
check("Overall Star Rating = 5", (await val("Overall Star Rating")) === "5", await val("Overall Star Rating"));
check("Health Inspection = 5", (await val("Health Inspection")) === "5", await val("Health Inspection"));
check("Staffing = 2", (await val("Staffing")) === "2", await val("Staffing"));
check("Quality of Resident Care = 5", (await val("Quality of Resident Care")) === "5", await val("Quality of Resident Care"));
check("No client-side error on live page", pageErrors.length === 0, pageErrors);

await page.screenshot({ path: path.join(here, "live-page.png"), fullPage: true });

// Download the PDF from the live site
const dl = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: /download pdf/i }).click();
const download = await dl;
const pdfPath = path.join(here, "live-686123.pdf");
await download.saveAs(pdfPath);
check("PDF downloaded from live site", true, download.suggestedFilename());
await browser.close();

// Parse the live PDF
const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data }).promise;
let text = ""; const links = [];
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  text += " " + (await p.getTextContent()).items.map((it) => it.str).join(" ");
  for (const a of await p.getAnnotations()) if (a.url || a.unsafeUrl) links.push(a.url || a.unsafeUrl);
}
const has = (s) => text.includes(s);
check("PDF: INFINITE banner", has("INFINITE") && has("Managed by MEDELITE"), null);
check("PDF: FACILITY ASSESSMENT SNAPSHOT", has("FACILITY ASSESSMENT SNAPSHOT"), null);
check("PDF: state FL", /\bFL\b/.test(text), null);
check("PDF: Name of Facility value", has("Kendall Lakes Healthcare and Rehab Center"), null);
check("PDF: Location", has("5280 SW 157 Avenue, Miami, FL"), null);
check("PDF: Census Capacity 150", has("Census Capacity") && has("150"), null);
check("PDF: Current Census 142", has("142"), null);
check("PDF: ratings present (5/5/2/5)", has("Overall Star Rating") && has("Staffing"), null);
check("PDF: clickable Medicare link = view-all?state=FL", links.includes(EXPECTED_URL), links);

try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(EXPECTED_URL, { redirect: "follow", signal: ctrl.signal });
  clearTimeout(t);
  check(`PDF link resolves (HTTP ${res.status})`, res.status < 400, res.status);
} catch (e) { check("PDF link resolves", false, String(e).slice(0, 120)); }

console.log("\n================ LIVE SITE VERIFICATION ================");
for (const r of results) console.log(r);
console.log("-------------------------------------------------------");
console.log(`PDF: ${pdfPath} | links: ${JSON.stringify(links)}`);
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
