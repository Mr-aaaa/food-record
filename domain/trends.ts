import type { BodyMetric, BodyMetricType } from "@/domain/types";

export type MetricPoint = { date: string; value: number };
export type AveragedMetricPoint = MetricPoint & { average: number };

export function movingAverage(points: number[], windowSize: number): number[] {
  if (windowSize <= 0) return [];
  return points.map((_, index) => {
    const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
    return window.reduce((total, value) => total + value, 0) / window.length;
  });
}

export function calendarMovingAverage(points: MetricPoint[], windowDays: number): AveragedMetricPoint[] {
  if (windowDays <= 0) return [];
  const dayMs = 86_400_000;
  return points.map((point, index) => {
    const current = Date.parse(`${point.date}T00:00:00Z`);
    const start = current - (windowDays - 1) * dayMs;
    const values = points.slice(0, index + 1).filter((candidate) => {
      const timestamp = Date.parse(`${candidate.date}T00:00:00Z`);
      return timestamp >= start && timestamp <= current;
    }).map((candidate) => candidate.value);
    return { ...point, average: values.reduce((total, value) => total + value, 0) / values.length };
  });
}

export function metricSeries(metrics: BodyMetric[], type: BodyMetricType): MetricPoint[] {
  const latestByDate = new Map<string, BodyMetric>();
  for (const metric of metrics) {
    if (metric[type] === undefined) continue;
    const date = metric.measuredAt.slice(0, 10);
    const existing = latestByDate.get(date);
    if (!existing || metric.measuredAt >= existing.measuredAt) latestByDate.set(date, metric);
  }
  return [...latestByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, metric]) => ({ date, value: metric[type]! }));
}
