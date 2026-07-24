import { describe, expect, test, vi } from "vitest";
import { calculateTarget, evaluateProfileSafety } from "@/domain/energy";
import { buildCorrectionPrompt, buildPortablePrompt, buildSchemaPrompt } from "@/domain/prompt";
import { calendarMovingAverage } from "@/domain/trends";
import { createDailyTargetSnapshot, mealRecordFromDraft } from "@/domain/workflows";
import { exportAll } from "@/storage/backup";
import { isQuotaExceededError } from "@/storage/errors";
import type { AppRepository } from "@/storage/repository";
import type { MealDraft, PersistedRecord, StoreName, TargetSnapshot } from "@/domain/types";

const profile = {
  sex: "female" as const,
  age: 30,
  heightCm: 165,
  weightKg: 60,
  goalWeightKg: 55,
  activityFactor: 1.375,
};

const target: TargetSnapshot = {
  calculationDate: "2026-07-23",
  sourceProfile: profile,
  target: {
    bmrKcal: 1300,
    tdeeKcal: 1787.5,
    targetCaloriesKcal: 1500,
    deficitRatio: 0.16,
    warnings: [],
    requiresManualReview: false,
  },
  macroTargets: { proteinG: 96, carbohydrateG: 180, fatG: 48 },
  planId: "balanced",
};

describe("stable daily target snapshots", () => {
  test("creates a date-keyed snapshot without mutating the previous day", () => {
    const previous = structuredClone(target);
    const next = createDailyTargetSnapshot(previous, {
      id: "higher-protein",
      name: "Higher protein",
      description: "test",
      proteinGPerKg: 2,
      fatGPerKg: 0.8,
      sourceType: "custom",
    }, "2026-07-24");

    expect(next).toMatchObject({
      calculationDate: "2026-07-24",
      planId: "higher-protein",
      macroTargets: { proteinG: 120, fatG: 48 },
    });
    expect(previous).toEqual(target);
  });
});

describe("safety and age contract", () => {
  test("blocks an aggressive requested deficit instead of silently capping it", () => {
    const result = calculateTarget(profile, profile.activityFactor, 0.4);
    expect(result.requiresManualReview).toBe(true);
    expect(result.deficitRatio).toBe(0.4);
    expect(result.warnings.join(" ")).toMatch(/25%|aggressive/i);
  });

  test("blocks implausible age and underweight goal with explicit reasons", () => {
    expect(evaluateProfileSafety({ ...profile, age: 121 }).reasons.join(" ")).toMatch(/年龄/);
    expect(evaluateProfileSafety({ ...profile, goalWeightKg: 40 }).reasons.join(" ")).toMatch(/BMI/i);
  });
});

describe("portable prompt variants", () => {
  test("uses the selected local date and exposes full, schema-only, and correction prompts", () => {
    expect(buildPortablePrompt("two eggs", "1.0", "2026-07-24")).toContain('"date":"2026-07-24"');
    expect(buildPortablePrompt("two eggs", "1.0", "2026-07-24")).not.toContain("2026-07-23");
    expect(buildSchemaPrompt("1.0")).toContain("Required JSON schema");
    expect(buildSchemaPrompt("1.0")).not.toContain("User input:");
    expect(buildCorrectionPrompt('{"amount":null}', ["items[0].amount is required"], "2026-07-24"))
      .toContain("items[0].amount is required");
  });
});

describe("AI import audit", () => {
  test("persists raw text, exact JSON, normalized draft, warnings, schema and AI time", () => {
    const draft: MealDraft = {
      schemaVersion: "1.0",
      recordId: "meal-1",
      date: "2026-07-24",
      mealType: "breakfast",
      status: "consumed",
      rawText: "two eggs",
      items: [{
        itemId: "item-1",
        foodId: "egg",
        name: "Egg",
        amount: 100,
        unit: "g",
        isAmbiguous: false,
        nutrition: { caloriesKcal: 144, proteinG: 13, carbohydrateG: 1, fatG: 10 },
        dataSource: { type: "ai_estimated", name: "External AI", confidence: 0.8, isEstimated: true },
      }],
      warnings: ["Estimated serving"],
      createdAt: "2026-07-24T08:00:00+08:00",
      updatedAt: "2026-07-24T08:00:00+08:00",
    };
    const originalJson = ` ${JSON.stringify(draft)} `;
    const record = mealRecordFromDraft(draft, originalJson, "2026-07-24T08:01:00+08:00");

    expect(record.audit).toMatchObject({
      rawText: "two eggs",
      originalJson,
      schemaVersion: "1.0",
      warnings: ["Estimated serving"],
      source: "external_ai",
      aiProcessedAt: "2026-07-24T08:01:00+08:00",
      normalizedDraft: draft,
    });
  });
});

describe("calendar moving average", () => {
  test("uses the trailing seven calendar days rather than seven observations", () => {
    expect(calendarMovingAverage([
      { date: "2026-07-01", value: 70 },
      { date: "2026-07-03", value: 68 },
      { date: "2026-07-10", value: 66 },
    ], 7)).toEqual([
      { date: "2026-07-01", value: 70, average: 70 },
      { date: "2026-07-03", value: 68, average: 69 },
      { date: "2026-07-10", value: 66, average: 66 },
    ]);
  });
});

describe("storage safety", () => {
  test("recognizes browser quota failures", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
  });

  test("exports all stores from one readonly transaction", async () => {
    const calls: Array<{ stores: readonly StoreName[]; mode?: IDBTransactionMode }> = [];
    const records: Record<StoreName, PersistedRecord[]> = {
      profile: [], settings: [], targets: [], meals: [], bodyMetrics: [], plans: [], templates: [], customFoods: [],
    };
    const repository: AppRepository = {
      list: vi.fn(async (store) => records[store]),
      get: vi.fn(),
      put: vi.fn(),
      putExact: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      transaction: async (stores, operation, mode) => {
        calls.push({ stores, mode });
        return operation(repository);
      },
    };

    await exportAll(repository, "0.1.0");
    expect(calls).toEqual([{ stores: expect.arrayContaining(Object.keys(records)), mode: "readonly" }]);
  });
});
