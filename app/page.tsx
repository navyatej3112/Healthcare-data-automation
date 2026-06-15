"use client";

import { useState } from "react";
import type { FacilityApiData } from "@/lib/mapping";
import { buildReport, EMPTY_MANUAL, type ManualInputs } from "@/lib/report";
import { MetricsVisuals } from "./components/MetricsVisuals";

interface ApiResponse {
  ccn: string;
  datasetIds: Record<string, string>;
  metricsAvailable: { claims: boolean; averages: boolean };
  facility: FacilityApiData;
  raw: Record<string, string>;
}

const CLIENT_TIMEOUT_MS = 25000;

// Shared UI tokens — restrained, enterprise-grade styling.
const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const primaryBtnClass =
  "inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-xl border border-slate-200 bg-white shadow-sm";
const sectionLabelClass =
  "text-xs font-semibold uppercase tracking-wider text-slate-500";

export default function Home() {
  const [ccn, setCcn] = useState("686123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsNote, setMetricsNote] = useState<string | null>(null);
  const [api, setApi] = useState<FacilityApiData | null>(null);
  const [manual, setManual] = useState<ManualInputs>(EMPTY_MANUAL);
  const [downloading, setDownloading] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ccn.trim();

    // Client-side format check for instant feedback (the server validates too).
    if (!/^\d{6}$/.test(trimmed)) {
      setApi(null);
      setMetricsNote(null);
      setError("Enter a 6-digit CCN (digits only), e.g. 686123.");
      return;
    }

    setLoading(true);
    setError(null);
    setMetricsNote(null);

    // Abort a hung request so the UI never spins forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/facility?ccn=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });

      // Parse defensively — an upstream/platform error may not be JSON.
      let data: (Partial<ApiResponse> & { error?: string }) | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setApi(null);
        setError(
          data?.error ?? `Lookup failed (HTTP ${res.status}). Please try again.`,
        );
        return;
      }

      const resp = data as ApiResponse;
      const facility = resp.facility;
      setApi(facility);
      // Reset override + census defaults from the fresh API payload.
      setManual((prev) => ({
        ...prev,
        nameOfFacility: facility.nameOfFacility,
        currentCensus:
          facility.currentCensusDefault !== null
            ? String(facility.currentCensusDefault)
            : "",
      }));

      // Tell the user if the bonus metrics degraded (MVP still complete).
      const ma = resp.metricsAvailable;
      if (ma && (!ma.claims || !ma.averages)) {
        setMetricsNote(
          "Live hospitalization/ED data is temporarily unavailable, so those rows show “—”. The rest of the report is complete.",
        );
      }
    } catch (err) {
      setApi(null);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("The request timed out. Please check your connection and try again.");
      } else {
        setError("Couldn't reach the server. Please check your connection and try again.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function setField<K extends keyof ManualInputs>(
    key: K,
    value: ManualInputs[K],
  ) {
    setManual((prev) => ({ ...prev, [key]: value }));
  }

  const nameIsOverridden =
    api !== null && manual.nameOfFacility.trim() !== api.nameOfFacility;

  // Merge CMS + manual inputs (template row order). Single source of truth for
  // the on-screen preview and the PDF, so the PDF reflects current form state
  // (including the name override and edited Current Census).
  const report = api ? buildReport(api, manual) : null;

  // Generate the PDF on the client at click time and trigger an instant
  // download. @react-pdf/renderer is imported dynamically so it never runs on
  // the server and stays out of the initial bundle.
  async function handleDownloadPdf() {
    if (!api || !report) return;
    setDownloading(true);
    try {
      const [{ pdf }, { FacilityPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./pdf/FacilityPdf"),
      ]);
      const blob = await pdf(<FacilityPdf report={report} />).toBlob();
      triggerDownload(blob, `Facility_Assessment_Snapshot_${api.ccn}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  // Generate an editable .docx on the client from the same report, dynamically
  // importing `docx` so it stays off the initial bundle.
  async function handleDownloadDocx() {
    if (!api || !report) return;
    setDownloadingDocx(true);
    try {
      const { generateFacilityDocxBlob } = await import("./docx/FacilityDocx");
      const blob = await generateFacilityDocxBlob(report);
      triggerDownload(blob, `Facility_Assessment_Snapshot_${api.ccn}.docx`);
    } finally {
      setDownloadingDocx(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Branding banner — fixed brand name, never replaced by facility name. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-6 text-center">
          <p className="text-xs font-semibold tracking-[0.12em] text-slate-400">
            INFINITE — Managed by MEDELITE
          </p>
          <h1 className="mt-2 text-xl font-semibold uppercase tracking-tight text-slate-900 sm:text-2xl">
            FACILITY ASSESSMENT SNAPSHOT
          </h1>
          <span className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {api?.state ?? "—"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* CCN lookup */}
        <section className={`${cardClass} p-5`}>
          <form
            onSubmit={handleLookup}
            className="flex flex-wrap items-end gap-3"
            aria-busy={loading}
          >
            <div>
              <label
                htmlFor="ccn-input"
                className="block text-xs font-medium text-slate-600"
              >
                CCN
              </label>
              <input
                id="ccn-input"
                value={ccn}
                onChange={(e) => setCcn(e.target.value)}
                placeholder="686123"
                aria-label="CCN"
                className={`${inputClass} mt-1 w-44 font-mono tracking-wide`}
              />
            </div>
            <button type="submit" disabled={loading} className={primaryBtnClass}>
              {loading ? "Looking up…" : "Look up facility"}
            </button>
            {error && (
              <p
                data-testid="error"
                className="self-center text-sm font-medium text-red-600"
              >
                {error}
              </p>
            )}
          </form>
          <p className="mt-2 text-xs text-slate-400">
            Enter a 6-digit CMS Certification Number to pull the facility&apos;s public CMS data.
          </p>
        </section>

        {metricsNote && (
          <p
            data-testid="metrics-note"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {metricsNote}
          </p>
        )}

        {api && report && <MetricsVisuals api={api} />}

        {api && report && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Editable inputs */}
            <section className={cardClass}>
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className={sectionLabelClass}>Operational inputs</h2>
              </div>
              <div className="space-y-4 p-5">
                <Field label="Name of Facility (override)">
                  <input
                    value={manual.nameOfFacility}
                    onChange={(e) => setField("nameOfFacility", e.target.value)}
                    aria-label="Name of Facility"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {nameIsOverridden ? (
                      <>Override active. API name: {api.nameOfFacility}</>
                    ) : (
                      <>Defaulted from CMS provider_name.</>
                    )}
                  </p>
                </Field>

                <Field label="EMR">
                  <input
                    value={manual.emr}
                    onChange={(e) => setField("emr", e.target.value)}
                    aria-label="EMR"
                    placeholder="PCC"
                    className={inputClass}
                  />
                </Field>

                <Field label="Current Census">
                  <input
                    value={manual.currentCensus}
                    onChange={(e) => setField("currentCensus", e.target.value)}
                    inputMode="numeric"
                    aria-label="Current Census"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Defaulted from Avg. residents/day (
                    {api.averageResidentsPerDay ?? "—"}) rounded to{" "}
                    {api.currentCensusDefault ?? "—"}.
                  </p>
                </Field>

                <Field label="Type of Patient">
                  <input
                    value={manual.typeOfPatient}
                    onChange={(e) => setField("typeOfPatient", e.target.value)}
                    aria-label="Type of Patient"
                    placeholder="Long-term & Short-term"
                    className={inputClass}
                  />
                </Field>

                <Field label="Previous Coverage from Medelite">
                  <select
                    value={manual.previousCoverage}
                    onChange={(e) =>
                      setField("previousCoverage", e.target.value as "Yes" | "No")
                    }
                    aria-label="Previous Coverage from Medelite"
                    className={inputClass}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </Field>

                <Field label="Previous Provider Performance from Medelite">
                  <input
                    value={manual.previousProviderPerformance}
                    onChange={(e) =>
                      setField("previousProviderPerformance", e.target.value)
                    }
                    aria-label="Previous Provider Performance from Medelite"
                    placeholder="About 30 patients/day"
                    className={inputClass}
                  />
                </Field>

                <Field label="Medical Coverage">
                  <input
                    value={manual.medicalCoverage}
                    onChange={(e) => setField("medicalCoverage", e.target.value)}
                    aria-label="Medical Coverage"
                    placeholder="Optometry, PCP, Podiatry"
                    className={inputClass}
                  />
                </Field>
              </div>
            </section>

            {/* Mapped report preview */}
            <section className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <h2 className={sectionLabelClass}>Report preview</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloading}
                    className={secondaryBtnClass}
                  >
                    {downloading ? "Generating…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDocx}
                    disabled={downloadingDocx}
                    className={secondaryBtnClass}
                  >
                    {downloadingDocx ? "Generating…" : "Download Word"}
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((row) => (
                    <tr key={row.label}>
                      <th className="w-1/2 py-2.5 pl-5 pr-4 text-left align-top text-sm font-medium text-slate-600">
                        {row.label}
                      </th>
                      <td
                        data-testid={`preview-${row.label}`}
                        className="py-2.5 pr-5 align-top text-sm text-slate-900"
                      >
                        {row.value || <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
