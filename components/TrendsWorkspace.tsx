"use client";

import { useMemo, useState } from "react";
import { metricSeries, movingAverage } from "@/domain/trends";
import type { BodyMetric } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const makeId = () => `metric-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function TrendsWorkspace() {
  const { bodyMetrics, saveBodyMetric, deleteBodyMetric } = useAppStore();
  const [editing, setEditing] = useState<BodyMetric | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [measuredAt, setMeasuredAt] = useState(localDateTimeValue());
  const [fasting, setFasting] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(() => {
    const weight = metricSeries(bodyMetrics, "weightKg");
    const waist = metricSeries(bodyMetrics, "waistCm");
    const weightAverage = movingAverage(weight.map((point) => point.value), 7);
    const waistAverage = movingAverage(waist.map((point) => point.value), 7);
    const byDate = new Map<string, { date: string; weight?: number; weightAverage?: number; waist?: number; waistAverage?: number }>();
    weight.forEach((point, index) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), weight: point.value, weightAverage: weightAverage[index] }));
    waist.forEach((point, index) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), waist: point.value, waistAverage: waistAverage[index] }));
    return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
  }, [bodyMetrics]);

  function resetForm() {
    setEditing(null); setWeightKg(""); setWaistCm(""); setMeasuredAt(localDateTimeValue()); setFasting(false); setNotes("");
  }

  function startEdit(metric: BodyMetric) {
    setEditing(metric); setWeightKg(metric.weightKg?.toString() ?? ""); setWaistCm(metric.waistCm?.toString() ?? "");
    setMeasuredAt(metric.measuredAt); setFasting(metric.fasting); setNotes(metric.notes ?? ""); setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const weight = numberOrUndefined(weightKg); const waist = numberOrUndefined(waistCm);
    if ((!weightKg.trim() && !waistCm.trim()) || (!weight && weightKg.trim()) || (!waist && waistCm.trim()) || !measuredAt) {
      setError("Enter a positive weight or waist measurement and its time");
      return;
    }
    try {
      await saveBodyMetric({ id: editing?.id ?? makeId(), measuredAt, weightKg: weight, waistCm: waist, fasting, notes: notes.trim() || undefined });
      setError(""); resetForm();
    } catch { setError("Could not save body metric"); }
  }

  async function remove(id: string) {
    try { await deleteBodyMetric(id); if (editing?.id === id) resetForm(); setError(""); }
    catch { setError("Could not delete body metric"); }
  }

  return <section className="trends-workspace" id="trends" aria-labelledby="trends-heading">
    <p className="eyebrow">Trends</p><h2 id="trends-heading">Body metrics and trends</h2>
    <div className="trends-grid">
      <form className="workspace-card" onSubmit={submit}>
        <h3>{editing ? "Edit body metric" : "Add body metric"}</h3>
        <label>Weight (kg)<input type="number" min="0" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} /></label>
        <label>Waist (cm)<input type="number" min="0" step="0.1" value={waistCm} onChange={(event) => setWaistCm(event.target.value)} /></label>
        <label>Measurement time<input type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} required /></label>
        <label className="checkbox-label"><input type="checkbox" checked={fasting} onChange={(event) => setFasting(event.target.checked)} />Fasting measurement</label>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="form-actions"><button className="primary-button" type="submit">Save body metric</button>{editing && <button type="button" onClick={resetForm}>Cancel edit</button>}</div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
      <section className="workspace-card"><h3>Measurement history</h3>
        {bodyMetrics.length === 0 ? <p>No body metrics recorded.</p> : <ul className="metric-history">{[...bodyMetrics].sort((left, right) => right.measuredAt.localeCompare(left.measuredAt)).map((metric) => <li key={metric.id}><div><strong>{metric.measuredAt.replace("T", " ")}</strong><span>{metric.weightKg === undefined ? "" : `Weight ${metric.weightKg} kg`}{metric.waistCm === undefined ? "" : ` Waist ${metric.waistCm} cm`}{metric.fasting ? " · fasting" : ""}{metric.notes ? ` · ${metric.notes}` : ""}</span></div><div><button type="button" onClick={() => startEdit(metric)}>Edit body metric</button><button type="button" onClick={() => void remove(metric.id)}>Delete body metric</button></div></li>)}</ul>}
      </section>
    </div>
    <section className="trend-table-panel" aria-labelledby="trend-table-heading"><h3 id="trend-table-heading">Seven-day averages</h3>
      <table aria-label="Body metric trend data"><caption>Raw daily values and trailing 7-day averages. Values are descriptive only.</caption><thead><tr><th scope="col">Date</th><th scope="col">Weight (kg)</th><th scope="col">Weight 7-day average</th><th scope="col">Waist (cm)</th><th scope="col">Waist 7-day average</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={5}>No trend data yet.</td></tr> : rows.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.weight?.toFixed(1) ?? "—"}</td><td>{row.weightAverage?.toFixed(1) ?? "—"}</td><td>{row.waist?.toFixed(1) ?? "—"}</td><td>{row.waistAverage?.toFixed(1) ?? "—"}</td></tr>)}</tbody></table>
    </section>
  </section>;
}
