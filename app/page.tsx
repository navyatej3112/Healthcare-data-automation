"use client";

import { useState } from "react";
import type { FacilityApiData } from "@/lib/mapping";
import { buildReport, EMPTY_MANUAL, type ManualInputs } from "@/lib/report";
import { MetricsVisuals } from "./components/MetricsVisuals";

interface ApiResponse {
  ccn: string;
  datasetId: string;
  facility: FacilityApiData;
  raw: Record<string, string>;
}

export default function Home() {
  const [ccn, setCcn] = useState("686123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<FacilityApiData | null>(null);
  const [manual, setManual] = useState<ManualInputs>(EMPTY_MANUAL);
  const [downloading, setDownloading] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/facility?ccn=${encodeURIComponent(ccn.trim())}`,
      );
      const data = (await res.json()) as ApiResponse | { error: string };
      if (!res.ok) {
        setApi(null);
        setError("error" in data ? data.error : "Lookup failed.");
        return;
      }
      const facility = (data as ApiResponse).facility;
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
    } catch {
      setApi(null);
      setError("Network error reaching the proxy.");
    } finally {
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Branding banner — fixed brand name, never replaced by facility name. */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5 text-center">
          <p className="text-sm font-semibold tracking-wide text-zinc-500">
            INFINITE — Managed by MEDELITE
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">
            FACILITY ASSESSMENT SNAPSHOT
          </h1>
          <p className="mt-0.5 text-sm font-medium text-zinc-600">
            {api?.state ?? "—"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* CCN lookup */}
        <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600">CCN</label>
            <input
              value={ccn}
              onChange={(e) => setCcn(e.target.value)}
              placeholder="686123"
              aria-label="CCN"
              className="mt-1 w-40 rounded border border-zinc-300 px-3 py-2 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Looking up…" : "Look up facility"}
          </button>
          {error && (
            <p data-testid="error" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>

        {api && report && <MetricsVisuals api={api} />}

        {api && report && (
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {/* Editable inputs */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Inputs
              </h2>
              <div className="space-y-4">
                <Field label="Name of Facility (override)">
                  <input
                    value={manual.nameOfFacility}
                    onChange={(e) => setField("nameOfFacility", e.target.value)}
                    aria-label="Name of Facility"
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
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
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                </Field>

                <Field label="Current Census">
                  <input
                    value={manual.currentCensus}
                    onChange={(e) => setField("currentCensus", e.target.value)}
                    inputMode="numeric"
                    aria-label="Current Census"
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
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
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                </Field>

                <Field label="Previous Coverage from Medelite">
                  <select
                    value={manual.previousCoverage}
                    onChange={(e) =>
                      setField("previousCoverage", e.target.value as "Yes" | "No")
                    }
                    aria-label="Previous Coverage from Medelite"
                    className="w-full rounded border border-zinc-300 px-3 py-2"
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
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                </Field>

                <Field label="Medical Coverage">
                  <input
                    value={manual.medicalCoverage}
                    onChange={(e) => setField("medicalCoverage", e.target.value)}
                    aria-label="Medical Coverage"
                    placeholder="Optometry, PCP, Podiatry"
                    className="w-full rounded border border-zinc-300 px-3 py-2"
                  />
                </Field>
              </div>
            </section>

            {/* Mapped report preview */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Mapped report preview
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloading}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {downloading ? "Generating…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDocx}
                    disabled={downloadingDocx}
                    className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {downloadingDocx ? "Generating…" : "Download Word"}
                  </button>
                </div>
              </div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.label} className="border-b border-zinc-200">
                      <th className="w-1/2 py-2 pr-3 text-left align-top font-medium text-zinc-700">
                        {row.label}
                      </th>
                      <td
                        data-testid={`preview-${row.label}`}
                        className="py-2 align-top text-zinc-900"
                      >
                        {row.value || <span className="text-zinc-400">—</span>}
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
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
