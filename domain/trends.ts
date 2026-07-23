import type { BodyMetric, BodyMetricType } from "@/domain/types";

export type MetricPoint = { date: string; value: number };

export function movingAverage(points: number[], windowSize: number): number[] {
  if (windowSize <= 0) return [];
  return points.map((_, index) => {
    const window = points.slice(Math.max(0, index - windowSize + 1), index + 1);
    return window.reduce((total, value) => total + value, 0) / window.length;
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
