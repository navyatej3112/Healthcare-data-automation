# Facility Assessment Report Generator

Lightweight Next.js (App Router) micro-app for Medelite: enter a facility CCN, pull
public CMS data through a server-side proxy, merge with manual operational inputs, and
export a print-ready PDF. No database, no auth.

Enter a facility's CCN, fetch its public CMS data through a server-side proxy, combine it
with manual operational inputs, and export a print-ready PDF. No database, no auth.

## Features

- **CCN lookup** against the CMS Provider Data Catalog through a server-side proxy (avoids
  browser CORS). Invalid or unknown CCNs are handled gracefully.
- **Field mapping** from raw CMS fields to clean report labels, with typed coercion and
  leading-zero-safe CCN handling (CCN stays a string throughout).
- **Facility-name override** — defaults to the API name; a user edit takes precedence.
- **Current Census** defaults from the API's average residents/day (rounded) but stays
  editable.
- **One-click PDF export** matching the two-column snapshot layout, with the branding
  banner and a clickable Medicare Care Compare link.

> **Note — avoid spaces in the project path.** Next 16's build/dev workers stall at startup
> when the absolute path contains spaces; run from a space-free path (e.g. `~/faa-app`).

## Run

```bash
npm run dev
# then:
curl 'http://localhost:3000/api/facility?ccn=686123'
```

## Architecture

- **`app/api/facility/route.ts`** — server-side proxy to the CMS Provider Data Catalog.
  CMS blocks direct browser fetches via CORS, so the client only ever calls this route.
  Validates the CCN, queries the dataset, returns the typed `facility` object plus the raw row.
- **`lib/cms.ts`** — CMS dataset ID and query-endpoint config.
- **`lib/mapping.ts`** — typed mapping layer: `RawCmsRow` (all-strings) → `FacilityApiData`
  with proper types. Ratings coerce to `1..5` numbers (blank/footnoted → `null`); beds and
  residents coerce to numbers; Current Census default = avg residents/day rounded to a whole
  headcount.
- **`lib/format.ts`** — light title-case helper (see below).
- **`lib/report.ts`** — single source of truth that merges CMS data + manual inputs into the
  report rows (template order) and builds the Medicare URL. Used by both the on-screen
  preview and the PDF, so they can't drift.
- **`app/pdf/FacilityPdf.tsx`** — `@react-pdf/renderer` document: branding banner, two-column
  label/value table, clickable Medicare `Link`. Loaded dynamically on download click, so it
  never runs on the server and stays out of the initial bundle.
- **`app/page.tsx`** — client component: CCN lookup, manual inputs, name override, live
  preview, and the "Download PDF" button (generates the blob client-side and downloads it).

## Field mapping (report label → source)

| Report label | Source | Type |
|---|---|---|
| Name of Facility | CMS `provider_name`, title-cased — **user override wins** | string |
| Location | `provider_address`, `citytown`, `state` (title-cased, no ZIP) | string |
| Census Capacity | `number_of_certified_beds` | number |
| Current Census | default = `average_number_of_residents_per_day` rounded; editable | number |
| Overall / Health Inspection / Staffing / Quality of Resident Care | `overall_rating` / `health_inspection_rating` / `staffing_rating` / `qm_rating` | number \| null |
| EMR, Type of Patient, Previous Coverage (Yes/No), Previous Provider Performance (free text), Medical Coverage | manual inputs | string |

### Name override logic (spec §4.3)

The name field is initialized to the title-cased API `provider_name` on each successful
fetch. It is a normal controlled input, so any user edit immediately takes precedence; the
final report uses whatever is in the field. A subsequent lookup re-defaults it to the new
facility's API name. The UI shows whether the value is the API default or an active override.

### Current Census default (spec §4.4)

The brief lists Current Census as a manual field while the layout template maps it to
`Average Number of Residents per Day`. We default it from that API value **rounded to a whole
number** (it's a headcount) and keep it fully editable — satisfying both readings.

### Casing (CMS ALL CAPS → title case)

CMS returns text in ALL CAPS (e.g. `KENDALL LAKES HEALTHCARE AND REHAB CENTER`,
`5280 SW 157 AVENUE`). `lib/format.ts` applies a **light** title-case to the facility-name
default and the address:

- Capitalizes each word; lowercases minor joining words (`and`, `of`, `the`, …) unless first.
- Keeps an **exceptions list** uppercase so tokens aren't mangled: entity suffixes
  (`LLC`, `INC`, `LTD`, `PLLC`, …), compass directions (`SW`, `NE`, `N`, `S`, …), and Roman
  numerals (`II`, `III`, …).
- It is intentionally light — it does **not** abbreviate or convert ordinals
  (`157 AVENUE` → `157 Avenue`, not `157th Ave`). The 2-letter state code is left uppercase.

Verified for CCN 686123: `KENDALL LAKES HEALTHCARE AND REHAB CENTER` →
`Kendall Lakes Healthcare and Rehab Center`; `5280 SW 157 AVENUE` / `MIAMI` / `FL` →
`5280 SW 157 Avenue, Miami, FL`.

## Decisions & assumptions

These resolve ambiguities between the brief, the layout template, and the sample output.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Medicare hyperlink**: `.../nursing-home/{CCN}/view-all?state={ST}` (hyphenated `view-all`, `?state` appended when the state is known). | The brief's sample-output-to-match uses a `view-all` path with `?state=`; verified it resolves (HTTP 200) for 686123. |
| 2 | **Name of Facility** uses CMS **`provider_name`**, not `legal_business_name`. | Sample shows the d/b/a "Kendall Lakes Healthcare and Rehab Center" = `provider_name`; `legal_business_name` is "..., LLC". The override field covers internal-name cases. |
| 3 | **Previous Provider Performance** is a **free-text** field. | Sample value is "About 30 patients/day" (prose, not a bare number); brief mapping table also calls it text. |
| 4 | **12 bonus metric rows** (later step) use the **template's exact labels and row order verbatim**, not cleaned-up versions. | Brief instructs matching the reference document's labels. |
| 5 | **Location** = street, city, state — **no ZIP**, matching the sample format (`5280 SW 157th Ave, Miami, FL`). | Sample output omits ZIP. |
| 6 | **CCN** is treated as a **6-character string** end-to-end; validated as `^\d{6}$`, never cast to int. | Data dictionary: CCN is `Text (6)` with possible leading zeros. Verified `015009` round-trips intact. |
| 7 | **Units** for bonus metrics will be driven by the **data dictionary**, not the sample numbers (short-stay = %, long-stay hosp/ED = rate per 1000 resident days). | Spec §3 + §7: the sample figures are illustrative/stale. |

## CMS dataset

- **Provider Information** — `4pq5-n9py`
  - Verified live on **2026-06-14** against the catalog metastore (entry last modified
    2026-05-01). IDs can change on the monthly refresh; re-verify if queries start
    returning empty/404.
  - CCN column: `cms_certification_number_ccn`.
  - Query pattern:
    `https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0?conditions[0][property]=cms_certification_number_ccn&conditions[0][value]={CCN}&conditions[0][operator]==`
- Claims-Based Quality Measures + State/US Averages dataset IDs (bonus) — **TBD**, to be
  discovered and verified before the bonus step.

## Validation (CCN 686123)

Live values differ from the stale sample PDF, exactly as the spec warned — correctness is
faithful live mapping, not matching the sample figures.

| Field | Live value | Sample PDF |
|---|---|---|
| provider_name | KENDALL LAKES HEALTHCARE AND REHAB CENTER | (same) |
| number_of_certified_beds | 150 | 120 |
| average_number_of_residents_per_day | 142.4 | 112 |
| overall / health / staffing / qm rating | 5 / 5 / 2 / 5 | 1 / 1 / 2 / 4 |

Error paths verified: `abc` → 400, `000000` → 404, `015009` → 200 with leading zero intact.
