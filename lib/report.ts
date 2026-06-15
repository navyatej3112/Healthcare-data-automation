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

// Short-stay measures are percentages (1 decimal, e.g. "25.6%").
function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

// Long-stay hospitalization/ED measures are rates per 1000 resident days
// (2 decimals, no unit suffix, e.g. "2.75"). Units driven by the data
// dictionary, not the sample PDF's numbers.
function rate(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

// Merge CMS data + manual inputs into the report, in the template's row order.
// The facility-name override and edited Current Census flow through here, so the
// PDF reflects current state.
export function buildReport(api: FacilityApiData, manual: ManualInputs): Report {
  const m = api.metrics;
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
      // 12 Hospitalization/ED metrics — template's exact labels and row order
      // verbatim (including the awkward ones). Short-stay = %, long-stay = rate.
      { label: "Short Term Hospitalization", value: pct(m.strHospitalization) },
      { label: "STR National Avg. for Hospitalization", value: pct(m.strHospitalizationNational) },
      { label: "STR State National Avg. for Hospitalization", value: pct(m.strHospitalizationState) },
      { label: "STR ED Visit", value: pct(m.strEdVisit) },
      { label: "STR ED Visits National Avg.", value: pct(m.strEdVisitNational) },
      { label: "STR ED Visits State Avg.", value: pct(m.strEdVisitState) },
      { label: "LT Hospitalization", value: rate(m.ltHospitalization) },
      { label: "LT National Avg. for Hospitalization", value: rate(m.ltHospitalizationNational) },
      { label: "LT State National Avg. for Hospitalization", value: rate(m.ltHospitalizationState) },
      { label: "ED Visit", value: rate(m.ltEdVisit) },
      { label: "LT ED Visits National Avg.", value: rate(m.ltEdVisitNational) },
      { label: "LT ED Visits State Avg.", value: rate(m.ltEdVisitState) },
    ],
  };
}
