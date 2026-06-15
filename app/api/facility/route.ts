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

const CMS_TIMEOUT_MS = 12000;

class TimeoutError extends Error {}

// Fetch one dataset with a hard timeout and a response-shape guard. Throws
// TimeoutError on timeout, Error otherwise; callers decide how to handle.
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CMS_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`CMS returned HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    // Guard against an unexpected/malformed shape.
    if (!data || !Array.isArray(data.results)) {
      throw new Error("Unexpected CMS response shape");
    }
    return data.results as Record<string, string>[];
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TimeoutError("CMS request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  try {
    const ccn = req.nextUrl.searchParams.get("ccn")?.trim();

    // CCN is a 6-character numeric string (leading zeros allowed). Keep it a
    // string throughout — never parse to int.
    if (!ccn || !/^\d{6}$/.test(ccn)) {
      return NextResponse.json(
        { error: "Enter a valid 6-digit CCN (e.g. 686123)." },
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

    // Provider Information is required. Distinguish a timeout (504) from other
    // upstream failures (502) so the user gets an accurate, actionable message.
    if (providerResult.status === "rejected") {
      const timedOut = providerResult.reason instanceof TimeoutError;
      return NextResponse.json(
        {
          error: timedOut
            ? "The CMS data service is taking too long to respond. Please try again in a moment."
            : "The CMS data service is unavailable right now. Please try again shortly.",
        },
        { status: timedOut ? 504 : 502 },
      );
    }

    const providerRow = providerResult.value[0] as RawCmsRow | undefined;
    if (!providerRow) {
      return NextResponse.json(
        { error: `No facility found for CCN ${ccn}. Double-check the number and try again.` },
        { status: 404 },
      );
    }

    const base = mapRawToFacility(providerRow);

    // Bonus metrics — best-effort. If a dataset failed, its rows degrade to null
    // ("—") and we flag it so the UI can tell the user; the MVP is unaffected.
    const claimsOk = claimsResult.status === "fulfilled";
    const averagesOk = averagesResult.status === "fulfilled";
    const claims = claimsOk ? (claimsResult.value as ClaimsRow[]) : [];
    const averages = averagesOk ? (averagesResult.value as AveragesRow[]) : [];
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
      metricsAvailable: { claims: claimsOk, averages: averagesOk },
      facility,
      raw: providerRow,
    });
  } catch {
    // Final safety net — never crash the route.
    return NextResponse.json(
      { error: "Something went wrong handling that request. Please try again." },
      { status: 500 },
    );
  }
}
