// Minimal mock of the CMS datastore query endpoint, used only to simulate
// upstream failure modes for the error-handling verification. Behavior is keyed
// by the requested CCN so a single instance covers every server scenario.
//
//   500500 -> provider query returns HTTP 500            (proxy should 502)
//   999999 -> provider query returns malformed JSON      (proxy should 502)
//   888888 -> provider query hangs (no response)         (proxy should 504)
//   777777 -> provider OK, claims query 500              (proxy 200, degraded)
//
// Run: node verification/mock-cms.mjs  (listens on :9099)
import http from "node:http";

const PROVIDER = "4pq5-n9py";
const CLAIMS = "ijh5-nb2v";

function providerRow(ccn) {
  return {
    cms_certification_number_ccn: ccn,
    provider_name: "MOCK TEST FACILITY",
    provider_address: "1 TEST STREET",
    citytown: "TESTVILLE",
    state: "FL",
    zip_code: "00000",
    number_of_certified_beds: "100",
    average_number_of_residents_per_day: "90",
    overall_rating: "3",
    health_inspection_rating: "3",
    staffing_rating: "3",
    qm_rating: "3",
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const datasetId = url.pathname.split("/datastore/query/")[1]?.split("/")[0] ?? "";
  const ccn = url.searchParams.get("conditions[0][value]") ?? "";
  const json = (obj) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (datasetId === PROVIDER) {
    if (ccn === "500500") {
      res.writeHead(500);
      res.end("upstream error");
      return;
    }
    if (ccn === "999999") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{ this is not valid json ");
      return;
    }
    if (ccn === "888888") {
      // Never respond — exercises the proxy's abort/timeout path.
      return;
    }
    json({ results: [providerRow(ccn || "777777")] });
    return;
  }

  if (datasetId === CLAIMS) {
    if (ccn === "777777") {
      res.writeHead(500);
      res.end("claims down");
      return;
    }
    json({ results: [] });
    return;
  }

  // Averages (no ccn condition) and anything else.
  json({ results: [{ state_or_nation: "NATION" }, { state_or_nation: "FL" }] });
});

server.listen(9099, () => console.log("mock-cms listening on http://localhost:9099"));
