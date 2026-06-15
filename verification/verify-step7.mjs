// Step 7 (bonus) verification: advanced error handling / boundary cases.
// Part A — server resilience: real instance (REAL_BASE) for format/404/ok/suppressed,
//          and a mock-CMS-backed instance (MOCK_BASE) for upstream 500 / malformed /
//          timeout / claims-down degradation.
// Part B — client UI states via Playwright route interception against REAL_BASE.
import { chromium, request as pwRequest } from "playwright";

const REAL_BASE = process.env.REAL_BASE || "http://localhost:3010";
const MOCK_BASE = process.env.MOCK_BASE || "http://localhost:3012";

let pass = 0, fail = 0;
const results = [];
const check = (n, c, got) => {
  if (c) { pass++; results.push(`PASS  ${n}`); }
  else { fail++; results.push(`FAIL  ${n}  (got: ${JSON.stringify(got)})`); }
};

// ---------- Part A: server resilience ----------
const api = await pwRequest.newContext();
async function getJson(base, ccn) {
  const r = await api.get(`${base}/api/facility?ccn=${ccn}`, { timeout: 30000 });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status(), body };
}

let r;
r = await getJson(REAL_BASE, "abc");
check("Invalid format -> 400 with message", r.status === 400 && /6-digit/i.test(r.body?.error || ""), r);

r = await getJson(REAL_BASE, "000000");
check("Unknown CCN -> 404 with message", r.status === 404 && /no facility found/i.test(r.body?.error || ""), r);

r = await getJson(REAL_BASE, "686123");
check("Valid CCN -> 200 + metricsAvailable both true",
  r.status === 200 && r.body?.metricsAvailable?.claims === true && r.body?.metricsAvailable?.averages === true, r);
check("686123 metrics populated (strHospitalization ~25.5)",
  Math.abs((r.body?.facility?.metrics?.strHospitalization ?? 0) - 25.575578) < 0.001, r.body?.facility?.metrics?.strHospitalization);
const realFacilityPayload = r.body; // reuse for client degraded mock

r = await getJson(REAL_BASE, "015014");
check("Suppressed metric -> 200, strHospitalization null",
  r.status === 200 && r.body?.facility?.metrics?.strHospitalization === null, r.body?.facility?.metrics?.strHospitalization);

r = await getJson(MOCK_BASE, "500500");
check("CMS returns 500 -> proxy 502 + clean message",
  r.status === 502 && /unavailable/i.test(r.body?.error || ""), r);

r = await getJson(MOCK_BASE, "999999");
check("CMS malformed shape -> proxy 502", r.status === 502, r);

r = await getJson(MOCK_BASE, "888888");
check("CMS hangs -> proxy 504 (timeout) + clean message",
  r.status === 504 && /too long|try again/i.test(r.body?.error || ""), r);

r = await getJson(MOCK_BASE, "777777");
check("Claims down but provider OK -> 200, degraded flag, MVP intact",
  r.status === 200 && r.body?.metricsAvailable?.claims === false &&
  r.body?.facility?.censusCapacity === 100 &&
  r.body?.facility?.metrics?.strHospitalization === null, r);
await api.dispose();

// ---------- Part B: client UI states ----------
const browser = await chromium.launch();

async function freshPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(REAL_BASE, { waitUntil: "networkidle" });
  return { ctx, page, errs };
}

// B1: invalid format — instant validation, NO network request sent.
{
  const { ctx, page } = await freshPage();
  let requested = false;
  await page.route("**/api/facility**", (route) => { requested = true; route.continue(); });
  await page.getByLabel("CCN").fill("12ab");
  await page.getByRole("button", { name: /look up facility/i }).click();
  const err = (await page.getByTestId("error").innerText().catch(() => "")).trim();
  check("UI: invalid format shows validation message", /6-digit/i.test(err), err);
  check("UI: invalid format sends no network request", requested === false, requested);
  await ctx.close();
}

// B2: 404 not found
{
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No facility found for CCN 222222. Double-check the number and try again." }) }));
  await page.getByLabel("CCN").fill("222222");
  await page.getByRole("button", { name: /look up facility/i }).click();
  const err = (await page.getByTestId("error").innerText()).trim();
  check("UI: 404 shows not-found message", /no facility found/i.test(err), err);
  await ctx.close();
}

// B3: 502 CMS unavailable
{
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The CMS data service is unavailable right now. Please try again shortly." }) }));
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  const err = (await page.getByTestId("error").innerText()).trim();
  check("UI: 502 shows service-unavailable message", /unavailable/i.test(err), err);
  await ctx.close();
}

// B4: network failure (request aborted)
{
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (route) => route.abort());
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  const err = (await page.getByTestId("error").innerText()).trim();
  check("UI: network failure shows connection message", /couldn.t reach the server/i.test(err), err);
  await ctx.close();
}

// B5: degraded metrics — note shown, MVP + averages still render
{
  const { ctx, page } = await freshPage();
  const degraded = { ...realFacilityPayload, metricsAvailable: { claims: false, averages: true } };
  await page.route("**/api/facility**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(degraded) }));
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  await page.getByTestId("preview-Location").waitFor({ timeout: 15000 });
  const note = (await page.getByTestId("metrics-note").innerText().catch(() => "")).trim();
  check("UI: degraded shows metrics-unavailable note", /temporarily unavailable/i.test(note), note);
  const cap = (await page.getByTestId("preview-Census Capacity").innerText()).trim();
  check("UI: degraded still renders MVP (Census Capacity 150)", cap === "150", cap);
  await ctx.close();
}

// B6: loading state visible during in-flight request
{
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", async (route) => {
    await new Promise((res) => setTimeout(res, 1200));
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(realFacilityPayload) });
  });
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  // While in-flight, the button shows "Looking up…" and is disabled.
  const btn = page.getByRole("button", { name: /looking up/i });
  const visible = await btn.isVisible().catch(() => false);
  const disabled = visible ? await btn.isDisabled() : false;
  check("UI: loading state shows 'Looking up…' and disables button", visible && disabled, { visible, disabled });
  await page.getByTestId("preview-Location").waitFor({ timeout: 15000 });
  await ctx.close();
}

await browser.close();

console.log("\n============ STEP 7 — ERROR HANDLING / BOUNDARY CASES ============");
for (const x of results) console.log(x);
console.log("-----------------------------------------------------------------");
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
