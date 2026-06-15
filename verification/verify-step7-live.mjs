// Live error-handling verification: real responses (format/404/ok/suppressed)
// against production, plus client UI states via Playwright route interception.
// (Upstream-CMS failure modes — 500/malformed/timeout — are covered locally by
// verify-step7.mjs against the mock-CMS; they can't be induced on Vercel.)
import { chromium, request as pwRequest } from "playwright";

const BASE = process.env.BASE_URL || "https://healthcare-data-automation.vercel.app";

let pass = 0, fail = 0;
const results = [];
const check = (n, c, got) => {
  if (c) { pass++; results.push(`PASS  ${n}`); }
  else { fail++; results.push(`FAIL  ${n}  (got: ${JSON.stringify(got)})`); }
};

// ---- Real production responses ----
const api = await pwRequest.newContext();
async function getJson(ccn) {
  const r = await api.get(`${BASE}/api/facility?ccn=${ccn}`, { timeout: 30000 });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status(), body };
}
let r;
r = await getJson("abc");
check("LIVE invalid format -> 400", r.status === 400 && /6-digit/i.test(r.body?.error || ""), r);
r = await getJson("000000");
check("LIVE unknown CCN -> 404", r.status === 404 && /no facility found/i.test(r.body?.error || ""), r);
r = await getJson("686123");
check("LIVE valid CCN -> 200 + metricsAvailable both true",
  r.status === 200 && r.body?.metricsAvailable?.claims === true && r.body?.metricsAvailable?.averages === true, r?.body?.metricsAvailable);
const realPayload = r.body;
r = await getJson("015014");
check("LIVE suppressed metric -> 200, strHospitalization null",
  r.status === 200 && r.body?.facility?.metrics?.strHospitalization === null, r.body?.facility?.metrics?.strHospitalization);
await api.dispose();

// ---- Client UI states (route interception on the live page) ----
const browser = await chromium.launch();
async function freshPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  return { ctx, page };
}

{ // invalid format: no request, validation message
  const { ctx, page } = await freshPage();
  let requested = false;
  await page.route("**/api/facility**", (rt) => { requested = true; rt.continue(); });
  await page.getByLabel("CCN").fill("123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  const err = (await page.getByTestId("error").innerText().catch(() => "")).trim();
  check("LIVE UI invalid format: message + no request", /6-digit/i.test(err) && !requested, { err, requested });
  await ctx.close();
}
{ // 404
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (rt) => rt.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No facility found for CCN 222222." }) }));
  await page.getByLabel("CCN").fill("222222");
  await page.getByRole("button", { name: /look up facility/i }).click();
  check("LIVE UI 404 message", /no facility found/i.test((await page.getByTestId("error").innerText()).trim()), null);
  await ctx.close();
}
{ // 502
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (rt) => rt.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The CMS data service is unavailable right now. Please try again shortly." }) }));
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  check("LIVE UI 502 service-unavailable message", /unavailable/i.test((await page.getByTestId("error").innerText()).trim()), null);
  await ctx.close();
}
{ // network abort
  const { ctx, page } = await freshPage();
  await page.route("**/api/facility**", (rt) => rt.abort());
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  check("LIVE UI network failure message", /couldn.t reach the server/i.test((await page.getByTestId("error").innerText()).trim()), null);
  await ctx.close();
}
{ // degraded metrics note + MVP renders
  const { ctx, page } = await freshPage();
  const degraded = { ...realPayload, metricsAvailable: { claims: false, averages: true } };
  await page.route("**/api/facility**", (rt) => rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(degraded) }));
  await page.getByLabel("CCN").fill("686123");
  await page.getByRole("button", { name: /look up facility/i }).click();
  await page.getByTestId("preview-Location").waitFor({ timeout: 15000 });
  check("LIVE UI degraded note shown", /temporarily unavailable/i.test((await page.getByTestId("metrics-note").innerText().catch(() => "")).trim()), null);
  check("LIVE UI degraded still renders MVP (150)", (await page.getByTestId("preview-Census Capacity").innerText()).trim() === "150", null);
  await ctx.close();
}
await browser.close();

console.log("\n========= STEP 7 LIVE — ERROR HANDLING =========");
for (const x of results) console.log(x);
console.log("------------------------------------------------");
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
