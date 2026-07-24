"use client";

import { useMemo, useState } from "react";
import { calendarMovingAverage, metricSeries } from "@/domain/trends";
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
    const weight = calendarMovingAverage(metricSeries(bodyMetrics, "weightKg"), 7);
    const waist = calendarMovingAverage(metricSeries(bodyMetrics, "waistCm"), 7);
    const byDate = new Map<string, { date: string; weight?: number; weightAverage?: number; waist?: number; waistAverage?: number }>();
    weight.forEach((point) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), weight: point.value, weightAverage: point.average }));
    waist.forEach((point) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), waist: point.value, waistAverage: point.average }));
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
      setError("请输入有效的体重或腰围及测量时间");
      return;
    }
    try {
      await saveBodyMetric({ id: editing?.id ?? makeId(), measuredAt, weightKg: weight, waistCm: waist, fasting, notes: notes.trim() || undefined });
      setError(""); resetForm();
    } catch { setError("无法保存身体指标"); }
  }

  async function remove(id: string) {
    try { await deleteBodyMetric(id); if (editing?.id === id) resetForm(); setError(""); }
    catch { setError("无法删除身体指标"); }
  }

  return <section className="trends-workspace" id="trends" aria-labelledby="trends-heading">
    <p className="eyebrow">趋势</p><h2 id="trends-heading">身体指标与趋势</h2>
    <div className="trends-grid">
      <form className="workspace-card" onSubmit={submit}>
        <h3>{editing ? "编辑身体指标" : "添加身体指标"}</h3>
        <label>体重（千克）<input type="number" min="0" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} /></label>
        <label>腰围（厘米）<input type="number" min="0" step="0.1" value={waistCm} onChange={(event) => setWaistCm(event.target.value)} /></label>
        <label>测量时间<input type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} required /></label>
        <label className="checkbox-label"><input type="checkbox" checked={fasting} onChange={(event) => setFasting(event.target.checked)} />空腹测量</label>
        <label>备注<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="form-actions"><button className="primary-button" type="submit">保存身体指标</button>{editing && <button type="button" onClick={resetForm}>取消编辑</button>}</div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
      <section className="workspace-card"><h3>测量记录</h3>
        {bodyMetrics.length === 0 ? <p>暂无身体指标记录。</p> : <ul className="metric-history">{[...bodyMetrics].sort((left, right) => right.measuredAt.localeCompare(left.measuredAt)).map((metric) => <li key={metric.id}><div><strong>{metric.measuredAt.replace("T", " ")}</strong><span>{metric.weightKg === undefined ? "" : `体重 ${metric.weightKg} 千克`}{metric.waistCm === undefined ? "" : ` · 腰围 ${metric.waistCm} 厘米`}{metric.fasting ? " · 空腹" : ""}{metric.notes ? ` · ${metric.notes}` : ""}</span></div><div><button aria-label={`编辑身体指标 ${metric.measuredAt}`} type="button" onClick={() => startEdit(metric)}>编辑</button><button aria-label={`删除身体指标 ${metric.measuredAt}`} type="button" onClick={() => void remove(metric.id)}>删除</button></div></li>)}</ul>}
      </section>
    </div>
    <section className="trend-visual" aria-labelledby="trend-visual-heading"><h3 id="trend-visual-heading">体重趋势（自然日 7 日均值）</h3>{rows.length === 0 ? <p>暂无趋势数据。</p> : [...rows].reverse().map((row) => <div className="bar-row" key={row.date}><span>{row.date}: {row.weight?.toFixed(1) ?? "-"} 千克 （均值 {row.weightAverage?.toFixed(1) ?? "-"}）</span><div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (row.weightAverage ?? row.weight ?? 0))}%` }} /></div></div>)}</section><section className="trend-table-panel" aria-labelledby="trend-table-heading"><h3 id="trend-table-heading">7 日均值</h3>
      <table aria-label="身体指标趋势数据"><caption>每日原始数值与 7 日移动均值。数值仅供参考。</caption><thead><tr><th scope="col">日期</th><th scope="col">体重（千克）</th><th scope="col">体重 7 日均值</th><th scope="col">腰围（厘米）</th><th scope="col">腰围 7 日均值</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={5}>暂无趋势数据。</td></tr> : rows.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.weight?.toFixed(1) ?? "—"}</td><td>{row.weightAverage?.toFixed(1) ?? "—"}</td><td>{row.waist?.toFixed(1) ?? "—"}</td><td>{row.waistAverage?.toFixed(1) ?? "—"}</td></tr>)}</tbody></table>
    </section>
  </section>;
}
