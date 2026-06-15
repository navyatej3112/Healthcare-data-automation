import { NextRequest, NextResponse } from "next/server";
import {
  PROVIDER_INFO_DATASET_ID,
  CLAIMS_DATASET_ID,
  AVERAGES_DATASET_ID,
  CCN_PROPERTY,
  cmsQueryUrl,
} from "@/lib/cms";
import {
  mapRawToFacility,
  buildMetrics,
  type RawCmsRow,
  type ClaimsRow,
  type AveragesRow,
} from "@/lib/mapping";

// Server-side proxy to the CMS Provider Data Catalog.
// The CMS API blocks direct browser fetches via CORS, so all CMS calls go
// through this route. The client only ever talks to this endpoint.
//
// Queries three datasets: Provider Information (MVP fields), Medicare Claims
// Quality Measures (facility hospitalization/ED values), and State US Averages
// (national/state averages). Provider Information is the critical path; the two
// bonus-metric datasets are best-effort and degrade to null on failure.

interface Condition {
  property: string;
  value: string;
}

async function queryDataset(
  datasetId: string,
  conditions: Condition[],
  limit: number,
): Promise<Record<string, string>[]> {
  const url = new URL(cmsQueryUrl(datasetId));
  conditions.forEach((c, i) => {
    url.searchParams.set(`conditions[${i}][property]`, c.property);
    url.searchParams.set(`conditions[${i}][value]`, c.value);
    url.searchParams.set(`conditions[${i}][operator]`, "=");
  });
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.results ?? [];
}

export async function GET(req: NextRequest) {
  const ccn = req.nextUrl.searchParams.get("ccn")?.trim();

  // CCN is a 6-character numeric string (leading zeros allowed). Keep it a
  // string throughout — never parse to int.
  if (!ccn || !/^\d{6}$/.test(ccn)) {
    return NextResponse.json(
      { error: "CCN must be a 6-digit string (e.g. 686123)." },
      { status: 400 },
    );
  }

  const ccnCondition: Condition = { property: CCN_PROPERTY, value: ccn };

  // Fetch all three datasets in parallel. Provider Information gates the
  // response; the bonus-metric datasets are allowed to fail independently.
  const [providerResult, claimsResult, averagesResult] =
    await Promise.allSettled([
      queryDataset(PROVIDER_INFO_DATASET_ID, [ccnCondition], 1),
      queryDataset(CLAIMS_DATASET_ID, [ccnCondition], 50),
      queryDataset(AVERAGES_DATASET_ID, [], 100),
    ]);

  if (providerResult.status === "rejected") {
    return NextResponse.json(
      { error: "Failed to reach the CMS API." },
      { status: 502 },
    );
  }

  const providerRow = providerResult.value[0] as RawCmsRow | undefined;
  if (!providerRow) {
    return NextResponse.json(
      { error: `No facility found for CCN ${ccn}.` },
      { status: 404 },
    );
  }

  const base = mapRawToFacility(providerRow);

  // Bonus metrics — best-effort. Missing data simply yields null values.
  const claims =
    claimsResult.status === "fulfilled"
      ? (claimsResult.value as ClaimsRow[])
      : [];
  const averages =
    averagesResult.status === "fulfilled"
      ? (averagesResult.value as AveragesRow[])
      : [];
  const national = averages.find((r) => r.state_or_nation === "NATION");
  const state = averages.find((r) => r.state_or_nation === base.state);

  const facility = { ...base, metrics: buildMetrics(claims, national, state) };

  return NextResponse.json({
    ccn,
    datasetIds: {
      providerInformation: PROVIDER_INFO_DATASET_ID,
      claimsQualityMeasures: CLAIMS_DATASET_ID,
      stateUsAverages: AVERAGES_DATASET_ID,
    },
    facility,
    raw: providerRow,
  });
}
