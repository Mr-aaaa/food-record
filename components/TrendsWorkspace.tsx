"use client";

import { useMemo, useState } from "react";
import { calendarMovingAverage, metricSeries } from "@/domain/trends";
import type { MetricPoint } from "@/domain/trends";
import type { BodyMetric } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

type MetricKey = "weightKg" | "waistCm";

const metricConfig: Record<MetricKey, { label: string; unit: string; color: string }> = {
  weightKg: { label: "体重", unit: "千克", color: "#1b6b6f" },
  waistCm: { label: "腰围", unit: "厘米", color: "#b07d1f" },
};

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

const DAY_MS = 86_400_000;

function dayTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function periodChange(series: MetricPoint[], days: number): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const cutoff = dayTimestamp(latest.date) - days * DAY_MS;
  let from: number | null = null;
  for (const point of series) {
    if (dayTimestamp(point.date) <= cutoff) from = point.value;
    else break;
  }
  if (from === null) from = series[0].value;
  return latest.value - from;
}

function sevenDayAverages(series: MetricPoint[]): { current: number | null; previous: number | null } {
  if (series.length === 0) return { current: null, previous: null };
  const latestT = dayTimestamp(series[series.length - 1].date);
  const currentStart = latestT - 7 * DAY_MS;
  const previousStart = latestT - 14 * DAY_MS;
  const average = (points: MetricPoint[]) => points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : null;
  const current = average(series.filter((point) => dayTimestamp(point.date) > currentStart));
  const previous = average(series.filter((point) => { const t = dayTimestamp(point.date); return t > previousStart && t <= currentStart; }));
  return { current, previous };
}

type ChartPoint = { date: string; value: number; average: number };

function TrendLineChart({ points, color, label, unit, areaId, format }: {
  points: ChartPoint[];
  color: string;
  label: string;
  unit: string;
  areaId: string;
  format: (value: number) => string;
}) {
  if (points.length === 0) return null;
  const W = 640;
  const H = 240;
  const padL = 42;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const values = points.flatMap((point) => [point.value, point.average].filter((value): value is number => Number.isFinite(value)));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;
  const x = (index: number) => padL + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => padT + (1 - (value - min) / (max - min)) * plotH;
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.average).toFixed(1)}`).join(" ");
  const areaPath = points.length > 1 ? `${linePath} L ${x(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z` : "";
  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, step) => {
    const value = min + (max - min) * (step / ticks);
    return { value, y: y(value) };
  });
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const latest = points[points.length - 1];
  return (
    <svg className="trend-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 7 日均值曲线，最新 ${format(latest.average)} ${unit}`}>
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((grid) => (
        <g key={grid.value}>
          <line className="trend-grid" x1={padL} y1={grid.y} x2={W - padR} y2={grid.y} />
          <text className="trend-axis" x={padL - 8} y={grid.y + 3} textAnchor="end">{format(grid.value)}</text>
        </g>
      ))}
      {areaPath && <path d={areaPath} fill={`url(#${areaId})`} />}
      {points.length > 1 && <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((point, index) => (
        <circle key={point.date} className="trend-dot" cx={x(index)} cy={y(point.value)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={1.75} />
      ))}
      {points.map((point, index) => {
        if (index % labelEvery !== 0 && index !== points.length - 1) return null;
        return <text key={`${point.date}-label`} className="trend-axis" x={x(index)} y={H - 8} textAnchor="middle">{point.date.slice(5)}</text>;
      })}
    </svg>
  );
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
  const [metric, setMetric] = useState<MetricKey>("weightKg");

  const rows = useMemo(() => {
    const weight = calendarMovingAverage(metricSeries(bodyMetrics, "weightKg"), 7);
    const waist = calendarMovingAverage(metricSeries(bodyMetrics, "waistCm"), 7);
    const byDate = new Map<string, { date: string; weight?: number; weightAverage?: number; waist?: number; waistAverage?: number }>();
    weight.forEach((point) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), weight: point.value, weightAverage: point.average }));
    waist.forEach((point) => byDate.set(point.date, { ...(byDate.get(point.date) ?? { date: point.date }), waist: point.value, waistAverage: point.average }));
    return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
  }, [bodyMetrics]);

  const config = metricConfig[metric];
  const series = useMemo(() => metricSeries(bodyMetrics, metric), [bodyMetrics, metric]);
  const averaged = useMemo(() => calendarMovingAverage(series, 7), [series]);
  const latest = averaged.length > 0 ? averaged[averaged.length - 1].value : null;

  function resetForm() {
    setEditing(null); setWeightKg(""); setWaistCm(""); setMeasuredAt(localDateTimeValue()); setFasting(false); setNotes("");
  }

  function startEdit(metricEntry: BodyMetric) {
    setEditing(metricEntry); setWeightKg(metricEntry.weightKg?.toString() ?? ""); setWaistCm(metricEntry.waistCm?.toString() ?? "");
    setMeasuredAt(metricEntry.measuredAt); setFasting(metricEntry.fasting); setNotes(metricEntry.notes ?? ""); setError("");
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
        {bodyMetrics.length === 0 ? <p>暂无身体指标记录。</p> : <ul className="metric-history">{[...bodyMetrics].sort((left, right) => right.measuredAt.localeCompare(left.measuredAt)).map((metricEntry) => <li key={metricEntry.id}><div><strong>{metricEntry.measuredAt.replace("T", " ")}</strong><span>{metricEntry.weightKg === undefined ? "" : `体重 ${metricEntry.weightKg} 千克`}{metricEntry.waistCm === undefined ? "" : ` · 腰围 ${metricEntry.waistCm} 厘米`}{metricEntry.fasting ? " · 空腹" : ""}{metricEntry.notes ? ` · ${metricEntry.notes}` : ""}</span></div><div><button aria-label={`编辑身体指标 ${metricEntry.measuredAt}`} type="button" onClick={() => startEdit(metricEntry)}>编辑</button><button aria-label={`删除身体指标 ${metricEntry.measuredAt}`} type="button" onClick={() => void remove(metricEntry.id)}>删除</button></div></li>)}</ul>}
      </section>
    </div>
    <section className="trend-visual" data-metric={metric} aria-labelledby="trend-visual-heading">
      <h3 id="trend-visual-heading">{config.label}趋势（自然日 7 日均值）</h3>
      <div className="trend-toggle" role="group" aria-label="趋势指标">
        {(Object.keys(metricConfig) as MetricKey[]).map((key) => (
          <button key={key} type="button" data-key={key} aria-pressed={metric === key} className={metric === key ? "is-active" : undefined} onClick={() => setMetric(key)}>{metricConfig[key].label}</button>
        ))}
      </div>
      {series.length === 0 ? (
        <p className="trend-empty">暂无{config.label}数据。</p>
      ) : (<>
        <div className="trend-stats">
          <div className="trend-stat trend-stat--current">
            <span className="trend-stat-label">当前</span>
            <span className="trend-stat-value">{latest !== null ? latest.toFixed(1) : "-"}<span className="trend-stat-unit">{config.unit}</span></span>
          </div>
          {[7, 30, 90].map((days) => {
            const delta = periodChange(series, days);
            const deltaClass = delta === null ? "" : delta < 0 ? "trend-delta--down" : delta > 0 ? "trend-delta--up" : "";
            return (
              <div className="trend-stat" key={days}>
                <span className="trend-stat-label">近 {days} 日</span>
                <span className={`trend-stat-delta ${deltaClass}`.trim()}>{delta === null ? "-" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}</span>
              </div>
            );
          })}
        </div>
        <div className="trend-chart-wrap">
          <TrendLineChart points={averaged} color={config.color} label={config.label} unit={config.unit} areaId={`trend-area-${metric}`} format={(value) => value.toFixed(1)} />
        </div>
      </>)}
    </section>
    <section className="trend-table-panel" aria-labelledby="trend-table-heading">
      <h3 id="trend-table-heading">7 日均值对比</h3>
      <div className="avg-compare">
        {(Object.keys(metricConfig) as MetricKey[]).map((key) => {
          const cfg = metricConfig[key];
          const { current, previous } = sevenDayAverages(metricSeries(bodyMetrics, key));
          const delta = current !== null && previous !== null ? current - previous : null;
          const deltaClass = delta === null ? "" : delta < 0 ? "trend-delta--down" : delta > 0 ? "trend-delta--up" : "";
          return (
            <div className="avg-card" data-key={key} key={key}>
              <span className="avg-card-label">{cfg.label} 7 日均值</span>
              <span className="avg-card-value">{current !== null ? current.toFixed(1) : "-"}<span className="avg-card-unit">{cfg.unit}</span></span>
              <span className={`avg-card-delta ${deltaClass}`.trim()}>{delta === null ? "暂无上期对比" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} 较上期`}</span>
            </div>
          );
        })}
      </div>
      <div className="trend-table-scroll">
        <table className="trend-table" aria-label="身体指标趋势数据">
          <caption>每日原始数值与 7 日移动均值。数值仅供参考。</caption>
          <thead><tr><th scope="col">日期</th><th scope="col">体重（千克）</th><th scope="col">体重 7 日均值</th><th scope="col">腰围（厘米）</th><th scope="col">腰围 7 日均值</th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={5}>暂无趋势数据。</td></tr> : rows.map((row, index) => <tr key={row.date} className={index === 0 ? "is-latest" : undefined}><th scope="row">{row.date}</th><td>{row.weight?.toFixed(1) ?? "-"}</td><td>{row.weightAverage?.toFixed(1) ?? "-"}</td><td>{row.waist?.toFixed(1) ?? "-"}</td><td>{row.waistAverage?.toFixed(1) ?? "-"}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  </section>;
}