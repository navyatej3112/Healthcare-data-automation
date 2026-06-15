// Step 5 (bonus) verification: the Word (.docx) export for CCN 686123.
// Downloads the .docx from the production server, unzips it, and checks the real
// document XML (text + table) and the hyperlink relationship — proving it's an
// editable Word doc with a real clickable link, not an image.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3010";
const EXPECTED_URL =
  "https://www.medicare.gov/care-compare/details/nursing-home/686123/view-all?state=FL";

let pass = 0, fail = 0;
const results = [];
const check = (n, c, got) => {
  if (c) { pass++; results.push(`PASS  ${n}`); }
  else { fail++; results.push(`FAIL  ${n}  (got: ${JSON.stringify(got)})`); }
};

// --- Download the .docx from the live app ---
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel("CCN").fill("686123");
await page.getByRole("button", { name: /look up facility/i }).click();
await page.getByTestId("preview-Location").waitFor({ timeout: 25000 });

const dl = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: /download word/i }).click();
const download = await dl;
const fname = download.suggestedFilename();
const docxPath = path.join(here, "step5-686123.docx");
await download.saveAs(docxPath);
await browser.close();

check("Filename = Facility_Assessment_Snapshot_686123.docx",
  fname === "Facility_Assessment_Snapshot_686123.docx", fname);

// --- Unzip the .docx (it's a real OOXML zip) and read the XML parts ---
const docXml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
const relsXml = execFileSync("unzip", ["-p", docxPath, "word/_rels/document.xml.rels"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

check("document.xml has a real table (<w:tbl>)", docXml.includes("<w:tbl"), null);
check("document.xml has real text runs (<w:t>)", docXml.includes("<w:t"), null);

// Strip tags to get readable text (tags -> spaces so adjacent cells separate).
const text = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const has = (s) => text.includes(s);

// Branding + guardrail
check("Branding: INFINITE — Managed by MEDELITE", has("INFINITE — Managed by MEDELITE"), null);
check("Branding: FACILITY ASSESSMENT SNAPSHOT", has("FACILITY ASSESSMENT SNAPSHOT"), null);
check("Branding: state FL", /\bFL\b/.test(text), null);

// MVP values
check("Name of Facility value", has("Kendall Lakes Healthcare and Rehab Center"), null);
check("Location", has("5280 SW 157 Avenue, Miami, FL"), null);
check("Census Capacity 150", has("Census Capacity") && has("150"), null);
check("Current Census 142", has("142"), null);
check("Ratings 5 / 5 / 2 / 5 labels present", has("Overall Star Rating") && has("Quality of Resident Care"), null);

// 12 metrics with correct units
const metrics = [
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
for (const [label, value] of metrics) {
  check(`Metric "${label}" + ${value}`, has(label) && has(value), null);
}

// Real clickable hyperlink: external relationship in the .rels part.
check("Hyperlink is a real external relationship", relsXml.includes('TargetMode="External"'), null);
check("Hyperlink target = Medicare view-all?state=FL URL",
  relsXml.includes(EXPECTED_URL) || relsXml.includes(EXPECTED_URL.replace(/&/g, "&amp;")),
  null);
check("document.xml references the hyperlink (<w:hyperlink>)", docXml.includes("<w:hyperlink"), null);

console.log("\n============ STEP 5 — WORD (.docx) EXPORT ============");
for (const r of results) console.log(r);
console.log("------------------------------------------------------");
console.log(`DOCX: ${docxPath}`);
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
