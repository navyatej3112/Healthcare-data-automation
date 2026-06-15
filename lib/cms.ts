// CMS Provider Data Catalog configuration.
//
// "Provider Information" dataset on data.cms.gov/provider-data.
// Dataset ID verified live on 2026-06-14 against the catalog metastore
// (catalog entry "Provider Information", last modified 2026-05-01).
// Dataset IDs can change on the monthly refresh — re-verify if queries
// start returning 404/empty results.
export const PROVIDER_INFO_DATASET_ID = "4pq5-n9py";

// CCN column in the datastore. CCN is a 6-character STRING with possible
// leading zeros (data dictionary: "Text (6)"). Never cast it to an integer.
export const CCN_PROPERTY = "cms_certification_number_ccn";

// Datastore query endpoint for index 0 (the dataset's primary distribution).
export const cmsQueryUrl = (datasetId: string) =>
  `https://data.cms.gov/provider-data/api/1/datastore/query/${datasetId}/0`;
