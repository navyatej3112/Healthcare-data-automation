# Build notes

## 1. Tech stack and the facility-name override logic

**Stack:** Next.js 16 (App Router) with React 19 and TypeScript, styled with Tailwind CSS,
deployed on Vercel. CMS requests go through a Next.js Route Handler that acts as a
server-side proxy. The PDF is generated entirely client-side with `@react-pdf/renderer`, so
the "Download PDF" button produces an instant browser download with no server round-trip.

**Facility-name override:** after a lookup, the name field is initialized to the CMS
`provider_name`. It is a normal controlled input, so whatever value is in the field is what
the report uses — if the user types a custom name, that edit wins; if they leave it alone, the
API name is used. A new lookup re-initializes the field to the new facility's API name. In
code this is a single piece of state seeded from the API on fetch and freely editable
thereafter, so "user edit wins" falls out naturally without extra branching.

## 2. CMS dataset/endpoint and how the mapping was validated

**Dataset:** the CMS Provider Data Catalog "Provider Information" dataset, id `4pq5-n9py`,
queried through the datastore query API:

```
https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0
  ?conditions[0][property]=cms_certification_number_ccn
  &conditions[0][value]={CCN}
  &conditions[0][operator]==
```

The browser never calls CMS directly — it calls the app's own `/api/facility` route, which
forwards the query server-side and returns the matched record.

**Mapping validation against CCN 686123:** each CMS column is mapped to its report label
through a typed layer (`lib/mapping.ts`) that coerces values rather than passing raw strings
through. Star ratings (`overall_rating`, `health_inspection_rating`, `staffing_rating`,
`qm_rating`) are parsed to `1–5` numbers, with blank/footnoted values becoming `null` instead
of "0" or "". `number_of_certified_beds` and `average_number_of_residents_per_day` are parsed
to numbers. The mapping was checked against the live record for 686123 and matched
field-for-field (e.g. `provider_name` → Name of Facility, `provider_address` + `citytown` +
`state` → Location, `number_of_certified_beds` → Census Capacity). Live values differ from the
stale sample PDF (150 beds and 5/5/2/5 ratings vs. the sample's 120 and 1/1/2/4), which is
expected — correctness means faithful mapping of current data, not matching the sample numbers.

**Leading-zero CCN handling:** the CCN is treated as a six-character string everywhere and is
never parsed to an integer. Input is validated with `^\d{6}$`, the value is sent to CMS as a
string, and it is stored as text in the dataset, so leading zeros are preserved end-to-end
(verified with `015009`, which round-trips intact). Unknown CCNs return a clean
"No facility found" message, and malformed input returns a validation error — neither crashes
the app.

## 3. Biggest hurdle and how it was resolved

The hardest issue was a local one: Next.js 16's build and dev workers stalled at startup with
no error output. After isolating it — Next's own primitives (SWC binding, worker threads,
child-process IPC) all worked individually, and a minimal throwaway Next app stalled
identically — the cause turned out to be **spaces in the project's absolute path**, which jam
Next 16's worker pipeline. Moving the project to a space-free path resolved it, and
`next build` then completed cleanly.

The other notable consideration was CORS: the CMS API blocks direct browser requests, so all
CMS calls are made server-side through the `/api/facility` route handler and the client only
ever talks to that endpoint. This also keeps the data-fetching logic in one place.
