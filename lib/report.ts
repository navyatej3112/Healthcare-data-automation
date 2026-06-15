import type { FacilityApiData } from "./mapping";

// Manual operational inputs (not in CMS). Shared by the form, the on-screen
// preview, and the PDF so they can never drift apart.
export interface ManualInputs {
  nameOfFacility: string; // defaults to API name; user edits win (override)
  emr: string;
  currentCensus: string; // defaults from avg residents/day (rounded), editable
  typeOfPatient: string;
  previousCoverage: "Yes" | "No";
  previousProviderPerformance: string;
  medicalCoverage: string;
}

export const EMPTY_MANUAL: ManualInputs = {
  nameOfFacility: "",
  emr: "",
  currentCensus: "",
  typeOfPatient: "",
  previousCoverage: "No",
  previousProviderPerformance: "",
  medicalCoverage: "",
};

export interface ReportRow {
  label: string;
  value: string;
}

export interface Report {
  state: string;
  ccn: string;
  medicareUrl: string;
  rows: ReportRow[];
}

// Locked decision: hyphenated `view-all`, with `?state=` when available.
export function medicareUrl(ccn: string, state: string): string {
  const base = `https://www.medicare.gov/care-compare/details/nursing-home/${ccn}/view-all`;
  return state ? `${base}?state=${state}` : base;
}

function ratingText(n: number | null): string {
  return n === null ? "—" : String(n);
}

// Merge CMS data + manual inputs into the report, in the template's row order
// (MVP subset; the 12 bonus metrics come later). The facility-name override and
// edited Current Census flow through here, so the PDF reflects current state.
export function buildReport(api: FacilityApiData, manual: ManualInputs): Report {
  return {
    state: api.state,
    ccn: api.ccn,
    medicareUrl: medicareUrl(api.ccn, api.state),
    rows: [
      { label: "Name of Facility", value: manual.nameOfFacility },
      { label: "Location", value: api.location },
      { label: "EMR", value: manual.emr },
      { label: "Census Capacity", value: ratingText(api.censusCapacity) },
      { label: "Current Census", value: manual.currentCensus },
      { label: "Type of Patient", value: manual.typeOfPatient },
      { label: "Previous Coverage from Medelite", value: manual.previousCoverage },
      {
        label: "Previous Provider Performance from Medelite",
        value: manual.previousProviderPerformance,
      },
      { label: "Medical Coverage", value: manual.medicalCoverage },
      { label: "Overall Star Rating", value: ratingText(api.overallRating) },
      { label: "Health Inspection", value: ratingText(api.healthInspectionRating) },
      { label: "Staffing", value: ratingText(api.staffingRating) },
      { label: "Quality of Resident Care", value: ratingText(api.qmRating) },
    ],
  };
}
