import { NextRequest, NextResponse } from "next/server";
import {
  PROVIDER_INFO_DATASET_ID,
  CCN_PROPERTY,
  cmsQueryUrl,
} from "@/lib/cms";
import { mapRawToFacility, type RawCmsRow } from "@/lib/mapping";

// Server-side proxy to the CMS Provider Data Catalog.
// The CMS API blocks direct browser fetches via CORS, so all CMS calls go
// through this route. The client only ever talks to this endpoint.
//
// Validates the CCN, queries the Provider Information dataset, and returns the
// typed/coerced `facility` object (plus the raw row for transparency).

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

  const url = new URL(cmsQueryUrl(PROVIDER_INFO_DATASET_ID));
  url.searchParams.set("conditions[0][property]", CCN_PROPERTY);
  url.searchParams.set("conditions[0][value]", ccn);
  url.searchParams.set("conditions[0][operator]", "=");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `CMS API returned HTTP ${res.status}.` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const row = data?.results?.[0];

    if (!row) {
      return NextResponse.json(
        { error: `No facility found for CCN ${ccn}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ccn,
      datasetId: PROVIDER_INFO_DATASET_ID,
      facility: mapRawToFacility(row as RawCmsRow),
      raw: row,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach the CMS API." },
      { status: 502 },
    );
  }
}
