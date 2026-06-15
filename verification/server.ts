// Verification-only HTTP server. Serves the bundled real page component and
// reimplements the /api/facility proxy using the REAL mapping/cms modules.
// Plain Node http — does not use Next's worker pipeline (which is wedged in this
// environment). Not part of the Next build.
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapRawToFacility, type RawCmsRow } from "../lib/mapping";
import { PROVIDER_INFO_DATASET_ID, CCN_PROPERTY, cmsQueryUrl } from "../lib/cms";

const appJs = readFileSync(path.join(__dirname, "app.js"), "utf8");

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Facility Assessment — verify</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
<div id="root"></div>
<script src="/app.js"></script>
</body>
</html>`;

async function handleFacility(ccn: string | null, res: http.ServerResponse) {
  const trimmed = ccn?.trim();
  if (!trimmed || !/^\d{6}$/.test(trimmed)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "CCN must be a 6-digit string (e.g. 686123)." }));
    return;
  }
  const url = new URL(cmsQueryUrl(PROVIDER_INFO_DATASET_ID));
  url.searchParams.set("conditions[0][property]", CCN_PROPERTY);
  url.searchParams.set("conditions[0][value]", trimmed);
  url.searchParams.set("conditions[0][operator]", "=");
  url.searchParams.set("limit", "1");
  try {
    const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!r.ok) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `CMS API returned HTTP ${r.status}.` }));
      return;
    }
    const data = await r.json();
    const row = data?.results?.[0];
    if (!row) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `No facility found for CCN ${trimmed}.` }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ccn: trimmed,
        datasetId: PROVIDER_INFO_DATASET_ID,
        facility: mapRawToFacility(row as RawCmsRow),
        raw: row,
      }),
    );
  } catch {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to reach the CMS API." }));
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://localhost");
  if (u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HTML);
  } else if (u.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(appJs);
  } else if (u.pathname === "/api/facility") {
    void handleFacility(u.searchParams.get("ccn"), res);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`verify server ready on http://localhost:${PORT}`));
