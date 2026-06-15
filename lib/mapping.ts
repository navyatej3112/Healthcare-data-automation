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

export function mapRawToFacility(row: RawCmsRow): FacilityApiData {
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
  };
}
