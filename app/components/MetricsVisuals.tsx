"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { FacilityApiData } from "@/lib/mapping";

// On-screen visual summary of the performance metrics (web only — exports are
// unchanged). Star ratings as cards; the 12 Hospitalization/ED metrics as four
// facility-vs-national-vs-state comparison charts. Short-stay (%) and long-stay
// (per-1000) each render in their own chart with its own axis, so the two units
// are never plotted on a shared scale. Sourced from the numeric FacilityApiData.

type Unit = "percent" | "rate";

interface MetricGroup {
  title: string;
  unit: Unit;
  facility: number | null;
  national: number | null;
  state: number | null;
}

const FACILITY_COLOR = "#0f766e"; // teal-700
const NATIONAL_COLOR = "#94a3b8"; // slate-400
const STATE_COLOR = "#cbd5e1"; // slate-300

function fmt(v: number, unit: Unit): string {
  return unit === "percent" ? `${v.toFixed(1)}%` : v.toFixed(2);
}

function RatingCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      data-testid={`rating-card-${label}`}
      className="rounded-lg border border-zinc-200 bg-white p-4"
    >
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      {value === null ? (
        <p className="mt-1 text-sm text-zinc-400">Not rated</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {value}
            <span className="text-base font-normal text-zinc-400"> / 5</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded bg-zinc-100">
            <div
              className="h-1.5 rounded bg-teal-700"
              style={{ width: `${(value / 5) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ComparisonCard({ group }: { group: MetricGroup }) {
  const rows = [
    { name: "Facility", value: group.facility, color: FACILITY_COLOR },
    { name: "National", value: group.national, color: NATIONAL_COLOR },
    { name: "State", value: group.state, color: STATE_COLOR },
  ];
  // Drop suppressed/missing values — never render a broken/zero bar.
  const data = rows
    .filter((r): r is { name: string; value: number; color: string } => r.value !== null)
    .map((r) => ({ ...r, label: fmt(r.value, group.unit) }));

  const unitLabel =
    group.unit === "percent" ? "% of residents" : "per 1,000 resident days";

  return (
    <div
      data-testid={`viz-card-${group.title}`}
      className="rounded-lg border border-zinc-200 bg-white p-4"
    >
      <p className="text-sm font-semibold text-zinc-800">{group.title}</p>
      <p className="text-xs text-zinc-500">{unitLabel}</p>

      {data.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">No data available</p>
      ) : (
        <div className="mt-2" style={{ width: "100%", height: 132 }}>
          <ResponsiveContainer>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
            >
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis
                type="category"
                dataKey="name"
                width={62}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#52525b" }}
              />
              <Bar dataKey="value" barSize={16} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {data.map((r) => (
                  <Cell key={r.name} fill={r.color} />
                ))}
                <LabelList
                  dataKey="label"
                  position="right"
                  style={{ fontSize: 11, fill: "#3f3f46" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {group.facility === null && data.length > 0 && (
        <p
          data-testid={`viz-missing-${group.title}`}
          className="mt-1 text-xs text-amber-600"
        >
          Facility value not reported
        </p>
      )}
    </div>
  );
}

export function MetricsVisuals({ api }: { api: FacilityApiData }) {
  const m = api.metrics;
  const ratings = [
    { label: "Overall", value: api.overallRating },
    { label: "Health Inspection", value: api.healthInspectionRating },
    { label: "Staffing", value: api.staffingRating },
    { label: "Quality of Resident Care", value: api.qmRating },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Short-Stay Hospitalization",
      unit: "percent",
      facility: m.strHospitalization,
      national: m.strHospitalizationNational,
      state: m.strHospitalizationState,
    },
    {
      title: "Short-Stay ED Visit",
      unit: "percent",
      facility: m.strEdVisit,
      national: m.strEdVisitNational,
      state: m.strEdVisitState,
    },
    {
      title: "Long-Stay Hospitalization",
      unit: "rate",
      facility: m.ltHospitalization,
      national: m.ltHospitalizationNational,
      state: m.ltHospitalizationState,
    },
    {
      title: "Long-Stay ED Visit",
      unit: "rate",
      facility: m.ltEdVisit,
      national: m.ltEdVisitNational,
      state: m.ltEdVisitState,
    },
  ];

  return (
    <section data-testid="metrics-visuals" className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Performance at a glance
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ratings.map((r) => (
          <RatingCard key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
      <p className="mt-5 mb-2 text-xs font-medium text-zinc-500">
        Hospitalization &amp; ED — facility vs. national and state averages
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <ComparisonCard key={g.title} group={g} />
        ))}
      </div>
    </section>
  );
}
