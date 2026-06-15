import { titleCase } from "@/lib/format";

// Raw CMS Provider Information row. Every value arrives as a string (or empty
// string when suppressed). We only type the fields we consume; the dataset has
// ~99 columns total.
export interface RawCmsRow {
  cms_certification_number_ccn: string;
  provider_name: string;
  legal_business_name: string;
  provider_address: string;
  citytown: string;
  state: string;
  zip_code: string;
  number_of_certified_beds: string;
  average_number_of_residents_per_day: string;
  overall_rating: string;
  health_inspection_rating: string;
  staffing_rating: string;
  qm_rating: string;
  [key: string]: string;
}

// A row from the Medicare Claims Quality Measures dataset (one row per measure).
export interface ClaimsRow {
  measure_code: string;
  resident_type: string; // "Short Stay" | "Long Stay"
  adjusted_score: string;
  observed_score: string;
  footnote_for_score: string;
  [key: string]: string;
}

// A row from the State US Averages dataset (keyed by state_or_nation).
export interface AveragesRow {
  state_or_nation: string;
  [key: string]: string;
}

// Claims measure codes for the four hospitalization/ED measures. STR -> Short
// Stay, LT -> Long Stay (per the brief's mapping hint).
export const CLAIMS_MEASURE = {
  strHospitalization: "521", // short-stay rehospitalized after admission (%)
  strEdVisit: "522", // short-stay outpatient ED visit (%)
  ltHospitalization: "551", // hospitalizations per 1000 long-stay resident days (rate)
  ltEdVisit: "552", // outpatient ED visits per 1000 long-stay resident days (rate)
} as const;

// Matching columns in the State US Averages dataset for those four measures.
export const AVG_COLUMN = {
  strHospitalization:
    "percentage_of_short_stay_residents_who_were_rehospitalized__1d02",
  strEdVisit: "percentage_of_short_stay_residents_who_had_an_outpatient_em_d911",
  ltHospitalization: "number_of_hospitalizations_per_1000_longstay_resident_days",
  ltEdVisit:
    "number_of_outpatient_emergency_department_visits_per_1000_l_de9d",
} as const;

// The 12 Hospitalization/ED values. Short-stay measures are percentages;
// long-stay measures are rates per 1000 resident days. `null` = missing or
// suppressed (footnoted), rendered as a placeholder.
export interface FacilityMetrics {
  strHospitalization: number | null;
  strHospitalizationNational: number | null;
  strHospitalizationState: number | null;
  strEdVisit: number | null;
  strEdVisitNational: number | null;
  strEdVisitState: number | null;
  ltHospitalization: number | null;
  ltHospitalizationNational: number | null;
  ltHospitalizationState: number | null;
  ltEdVisit: number | null;
  ltEdVisitNational: number | null;
  ltEdVisitState: number | null;
}

export const EMPTY_METRICS: FacilityMetrics = {
  strHospitalization: null,
  strHospitalizationNational: null,
  strHospitalizationState: null,
  strEdVisit: null,
  strEdVisitNational: null,
  strEdVisitState: null,
  ltHospitalization: null,
  ltHospitalizationNational: null,
  ltHospitalizationState: null,
  ltEdVisit: null,
  ltEdVisitNational: null,
  ltEdVisitState: null,
};

// Typed, coerced facility data sourced from the CMS API. Numeric fields are
// `number | null` (null = missing/suppressed/footnoted by CMS).
export interface FacilityApiData {
  ccn: string;
  /** Raw CMS provider_name, untouched (ALL CAPS) — kept for reference. */
  providerNameRaw: string;
  /** Title-cased provider_name — the default for "Name of Facility" / override. */
  nameOfFacility: string;
  /** Title-cased "street, city, ST" (no ZIP, per decision #5). */
  location: string;
  /** 2-letter state code for the header/hyperlink (left as-is). */
  state: string;
  /** Number of Certified Beds -> "Census Capacity". */
  censusCapacity: number | null;
  /** Average Number of Residents per Day (raw, unrounded). */
  averageResidentsPerDay: number | null;
  /** Default for "Current Census": avg residents/day rounded to a headcount. */
  currentCensusDefault: number | null;
  overallRating: number | null;
  healthInspectionRating: number | null;
  staffingRating: number | null;
  qmRating: number | null;
  /** 12 Hospitalization/ED metrics (bonus). */
  metrics: FacilityMetrics;
}

// Star ratings are "1".."5", or "" / a footnote code when suppressed.
function toRating(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[1-5]$/.test(trimmed)) return null;
  return Number(trimmed);
}

// Generic numeric coercion (beds, residents). Returns null for blank/non-numeric.
function toNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildLocation(row: RawCmsRow): string {
  // Street + city are title-cased; the 2-letter state stays uppercase. No ZIP.
  const street = titleCase(row.provider_address);
  const city = titleCase(row.citytown);
  const st = (row.state || "").trim().toUpperCase();
  return [street, city, st].filter(Boolean).join(", ");
}

// Facility metric value = the risk-adjusted score (data dictionary: "Adjusted
// Score — the risk-adjusted value for the quality measure"), which is what Care
// Compare publishes and what feeds the QM star rating. A footnoted (suppressed)
// or blank score becomes null.
function claimsScore(row: ClaimsRow | undefined): number | null {
  if (!row) return null;
  if (row.footnote_for_score && row.footnote_for_score.trim() !== "") return null;
  return toNumber(row.adjusted_score);
}

function avgValue(row: AveragesRow | undefined, column: string): number | null {
  if (!row) return null;
  return toNumber(row[column]);
}

// Merge facility claims rows + national/state average rows into the 12 metrics.
export function buildMetrics(
  claims: ClaimsRow[],
  national: AveragesRow | undefined,
  state: AveragesRow | undefined,
): FacilityMetrics {
  const byCode = new Map(claims.map((r) => [r.measure_code, r]));
  return {
    strHospitalization: claimsScore(byCode.get(CLAIMS_MEASURE.strHospitalization)),
    strHospitalizationNational: avgValue(national, AVG_COLUMN.strHospitalization),
    strHospitalizationState: avgValue(state, AVG_COLUMN.strHospitalization),
    strEdVisit: claimsScore(byCode.get(CLAIMS_MEASURE.strEdVisit)),
    strEdVisitNational: avgValue(national, AVG_COLUMN.strEdVisit),
    strEdVisitState: avgValue(state, AVG_COLUMN.strEdVisit),
    ltHospitalization: claimsScore(byCode.get(CLAIMS_MEASURE.ltHospitalization)),
    ltHospitalizationNational: avgValue(national, AVG_COLUMN.ltHospitalization),
    ltHospitalizationState: avgValue(state, AVG_COLUMN.ltHospitalization),
    ltEdVisit: claimsScore(byCode.get(CLAIMS_MEASURE.ltEdVisit)),
    ltEdVisitNational: avgValue(national, AVG_COLUMN.ltEdVisit),
    ltEdVisitState: avgValue(state, AVG_COLUMN.ltEdVisit),
  };
}

export function mapRawToFacility(
  row: RawCmsRow,
  metrics: FacilityMetrics = EMPTY_METRICS,
): FacilityApiData {
  const beds = toNumber(row.number_of_certified_beds);
  const avgResidents = toNumber(row.average_number_of_residents_per_day);

  return {
    ccn: (row.cms_certification_number_ccn || "").trim(),
    providerNameRaw: row.provider_name ?? "",
    nameOfFacility: titleCase(row.provider_name),
    location: buildLocation(row),
    state: (row.state || "").trim().toUpperCase(),
    censusCapacity: beds !== null ? Math.round(beds) : null,
    averageResidentsPerDay: avgResidents,
    // Current Census is a headcount, so round the daily average to a whole number.
    currentCensusDefault: avgResidents !== null ? Math.round(avgResidents) : null,
    overallRating: toRating(row.overall_rating),
    healthInspectionRating: toRating(row.health_inspection_rating),
    staffingRating: toRating(row.staffing_rating),
    qmRating: toRating(row.qm_rating),
    metrics,
  };
}
