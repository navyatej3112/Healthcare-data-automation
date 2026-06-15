// CMS Provider Data Catalog configuration.
//
// "Provider Information" dataset on data.cms.gov/provider-data.
// Dataset ID verified live on 2026-06-14 against the catalog metastore
// (catalog entry "Provider Information", last modified 2026-05-01).
// Dataset IDs can change on the monthly refresh — re-verify if queries
// start returning 404/empty results.
export const PROVIDER_INFO_DATASET_ID = "4pq5-n9py";

// Bonus (Hospitalization/ED metrics). Dataset IDs verified live on 2026-06-15
// against the catalog metastore (both last modified 2026-05-01). Re-verify on
// the monthly refresh if queries start returning empty/404.
//   - Medicare Claims Quality Measures (facility-level, long format)
//   - State US Averages (one row per state plus a NATION row)
export const CLAIMS_DATASET_ID = "ijh5-nb2v";
export const AVERAGES_DATASET_ID = "xcdc-v8bm";

// CCN column in the datastore. CCN is a 6-character STRING with possible
// leading zeros (data dictionary: "Text (6)"). Never cast it to an integer.
export const CCN_PROPERTY = "cms_certification_number_ccn";

// Column identifying a row in the State US Averages dataset (a 2-letter state
// postal code, or the literal "NATION").
export const STATE_OR_NATION_PROPERTY = "state_or_nation";

// Base of the CMS Provider Data Catalog. Overridable via env for testing
// (e.g. pointing at a local mock to simulate upstream failures); defaults to the
// real catalog in production.
const CMS_BASE = process.env.CMS_BASE_URL ?? "https://data.cms.gov/provider-data";

// Datastore query endpoint for index 0 (the dataset's primary distribution).
export const cmsQueryUrl = (datasetId: string) =>
  `${CMS_BASE}/api/1/datastore/query/${datasetId}/0`;
