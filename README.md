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
- **One-click PDF and Word (.docx) export** — same content, row order, branding, and a
  clickable Medicare Care Compare link. The .docx is fully editable (real text + table).
- **12 Hospitalization/ED metrics** (bonus): short-stay (%) and long-stay (per-1000 rate)
  facility values plus their national and state averages.
- **On-page visuals** (bonus, web only): star-rating cards and responsive
  facility-vs-national-vs-state comparison charts (Recharts). Short-stay (%) and long-stay
  (per-1000) render in separate charts so the two units never share an axis.

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
- **`app/docx/FacilityDocx.ts`** — `docx` document: same content as an editable Word file
  (real text + table + `ExternalHyperlink`). Also loaded dynamically on click. `@react-pdf/renderer`
  and `docx` are runtime dependencies but kept off the critical path via lazy import.
- **`app/components/MetricsVisuals.tsx`** — on-page rating cards + Recharts comparison charts
  (web only; not in the exports). Reads the numeric `FacilityApiData`; renders only after a
  lookup, so it never server-renders. Suppressed metrics are omitted with a caption.
- **`app/page.tsx`** — client component: CCN lookup, manual inputs, name override, live
  preview, the visuals, and the "Download PDF"/"Download Word" buttons.

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

## CMS datasets

All three were verified live against the catalog metastore (all last modified 2026-05-01).
IDs can change on the monthly refresh; re-verify if queries start returning empty/404. The
CCN column is `cms_certification_number_ccn` across datasets, and the query pattern is
`.../datastore/query/{datasetId}/0?conditions[0][property]=...&conditions[0][value]=...&conditions[0][operator]==`.

- **Provider Information** — `4pq5-n9py` (MVP fields: name, address, beds, residents, ratings).
- **Medicare Claims Quality Measures** — `ijh5-nb2v` (facility hospitalization/ED values).
  Long format: one row per measure with `measure_code`, `resident_type`, and adjusted/observed
  scores. Codes used: 521 (STR rehospitalization), 522 (STR ED), 551 (LT hospitalizations per
  1000), 552 (LT ED per 1000).
- **State US Averages** — `xcdc-v8bm` (national + per-state averages; one row per
  `state_or_nation`, e.g. `NATION` or `FL`).

**Metric value chosen:** the facility value is the **risk-adjusted score** (data dictionary:
"Adjusted Score — the risk-adjusted value for the quality measure"), which is what Care Compare
publishes and what feeds the QM star rating. National/state averages come from the State US
Averages dataset. **Units** are driven by the data dictionary, not the sample PDF: short-stay
measures are percentages (1 decimal); long-stay hospitalization/ED are rates per 1000 resident
days (2 decimals). Suppressed (footnoted) or blank values render as "—", consistent with
ratings. The claims/averages fetches are best-effort, so a hiccup in either degrades those rows
to "—" without affecting the MVP fields.

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
