import { describe, expect, test } from "vitest";
import { metricSeries, movingAverage } from "@/domain/trends";
import type { BodyMetric } from "@/domain/types";

describe("movingAverage", () => {
  test("uses available values until the seven-day window is full", () => {
    expect(movingAverage([70, 69, 68], 7)).toEqual([70, 69.5, 69]);
  });

  test("returns no averages for an empty input", () => {
    expect(movingAverage([], 7)).toEqual([]);
  });
});

describe("metricSeries", () => {
  test("omits measurements that do not contain the selected metric", () => {
    const metrics: BodyMetric[] = [
      { id: "weight", measuredAt: "2026-07-01T07:00", weightKg: 70, fasting: true },
      { id: "waist", measuredAt: "2026-07-02T07:00", waistCm: 82, fasting: true },
    ];
    expect(metricSeries(metrics, "weightKg")).toEqual([{ date: "2026-07-01", value: 70 }]);
  });

  test("uses the latest measurement as the same-day value", () => {
    const metrics: BodyMetric[] = [
      { id: "early", measuredAt: "2026-07-01T07:00", weightKg: 70, fasting: true },
      { id: "late", measuredAt: "2026-07-01T19:00", weightKg: 69.5, fasting: false },
      { id: "next", measuredAt: "2026-07-02T07:00", weightKg: 69, fasting: true },
    ];
    expect(metricSeries(metrics, "weightKg")).toEqual([
      { date: "2026-07-01", value: 69.5 },
      { date: "2026-07-02", value: 69 },
    ]);
  });
});
