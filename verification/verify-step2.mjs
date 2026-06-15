// Playwright assertions for the Step 2 render. Exported as runChecks() so the
// runner can drive it; also runnable standalone against an already-running
// server via BASE_URL (default http://localhost:3000).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runChecks(base = "http://localhost:3000") {
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

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // ---- CCN 686123 ----
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  await page.getByTestId("preview-Location").waitFor({ timeout: 20000 });

  const nameInput = page.getByLabel("Name of Facility");
  const nameVal = await nameInput.inputValue();
  check(
    'Name = "Kendall Lakes Healthcare and Rehab Center"',
    nameVal === "Kendall Lakes Healthcare and Rehab Center",
    nameVal,
  );
  check("Name field is editable", await nameInput.isEditable(), null);

  const loc = (await page.getByTestId("preview-Location").innerText()).trim();
  check(
    'Location = "5280 SW 157 Avenue, Miami, FL"',
    loc === "5280 SW 157 Avenue, Miami, FL",
    loc,
  );

  const cap = (await page.getByTestId("preview-Census Capacity").innerText()).trim();
  check("Census Capacity = 150", cap === "150", cap);

  const ccInput = page.getByLabel("Current Census");
  const ccVal = await ccInput.inputValue();
  check("Current Census prefilled = 142", ccVal === "142", ccVal);
  check("Current Census is editable", await ccInput.isEditable(), null);

  const ratings = {
    "Overall Star Rating": "5",
    "Health Inspection": "5",
    Staffing: "2",
    "Quality of Resident Care": "5",
  };
  for (const [label, expected] of Object.entries(ratings)) {
    const v = (await page.getByTestId(`preview-${label}`).innerText()).trim();
    check(`Rating ${label} = ${expected}`, v === expected, v);
  }

  for (const label of [
    "EMR",
    "Current Census",
    "Type of Patient",
    "Previous Coverage from Medelite",
    "Previous Provider Performance from Medelite",
    "Medical Coverage",
  ]) {
    const visible = await page.getByLabel(label).isVisible().catch(() => false);
    check(`Manual field present: ${label}`, visible, visible);
  }

  const cov = page.getByLabel("Previous Coverage from Medelite");
  const tag = await cov.evaluate((el) => el.tagName.toLowerCase());
  const opts = await cov.locator("option").allInnerTexts();
  check(
    "Previous Coverage is a Yes/No <select>",
    tag === "select" && opts.map((o) => o.trim()).sort().join(",") === "No,Yes",
    { tag, opts },
  );

  const headerText = await page.locator("header").innerText();
  check(
    "Banner: INFINITE — Managed by MEDELITE",
    /INFINITE\s+—\s+Managed by MEDELITE/.test(headerText),
    headerText,
  );
  check(
    "Banner: FACILITY ASSESSMENT SNAPSHOT",
    /FACILITY ASSESSMENT SNAPSHOT/.test(headerText),
    headerText,
  );
  check("Banner: state FL", /\bFL\b/.test(headerText), headerText);
  check("No client-side crash (686123)", pageErrors.length === 0, pageErrors);

  const shot = path.join(here, "verify-step2.png");
  await page.screenshot({ path: shot, fullPage: true });
  results.push(`INFO  screenshot saved to ${shot}`);

  // ---- CCN 000000 (not found) ----
  await page.getByLabel("CCN").fill("000000");
  await page.getByRole("button", { name: /look up facility/i }).click();
  await page.getByTestId("error").waitFor({ timeout: 20000 });
  const errText = (await page.getByTestId("error").innerText()).trim();
  check("000000 shows a clean not-found message", /no facility found/i.test(errText), errText);
  const stillThere = await page.getByLabel("CCN").isVisible();
  check("000000 did not crash the page", stillThere && pageErrors.length === 0, {
    stillThere,
    pageErrors,
  });

  await browser.close();

  console.log("\n================ STEP 2 VERIFICATION ================");
  for (const r of results) console.log(r);
  console.log("-----------------------------------------------------");
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  return fail;
}

// Standalone: assumes a server is already running at BASE_URL.
if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = await runChecks(process.env.BASE_URL || "http://localhost:3000");
  process.exit(fail === 0 ? 0 : 1);
}
