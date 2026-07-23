import { describe, expect, test } from "vitest";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { exportAll, restoreBackup, validateBackup } from "@/storage/backup";
import type { StoreName } from "@/domain/types";

let sequence = 0;
const stores: StoreName[] = ["profile", "settings", "targets", "meals", "bodyMetrics", "plans", "templates", "customFoods"];

function repository() {
  sequence += 1;
  return createIndexedDbRepository(`backup-test-${sequence}`);
}

async function seedAllStores(target: ReturnType<typeof repository>) {
  const source = { type: "user_manual" as const, name: "Kitchen scale", confidence: 1, isEstimated: false };
  await target.put("profile", { id: "current", sex: "female", age: 30, heightCm: 165, weightKg: 60 });
  await target.put("settings", { id: "onboarding", planId: "custom-plan" });
  await target.put("targets", { id: "current", calculationDate: "2026-07-23", sourceProfile: { sex: "female", age: 30, heightCm: 165, weightKg: 60 }, target: { bmrKcal: 1300, tdeeKcal: 1800, targetCaloriesKcal: 1500, deficitRatio: .15, warnings: [], requiresManualReview: false }, macroTargets: { proteinG: 100, carbohydrateG: 150, fatG: 55 }, planId: "custom-plan" });
  await target.put("meals", { id: "meal-1", date: "2026-07-23", mealType: "lunch", status: "consumed", foodItems: [{ id: "food-1", name: "Rice", caloriesKcal: 180, nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: source }] });
  await target.put("bodyMetrics", { id: "metric-1", measuredAt: "2026-07-23T08:00", weightKg: 60, fasting: true, notes: "Morning" });
  await target.put("plans", { id: "custom-plan", name: "Coach plan", description: "Personal plan", proteinGPerKg: 2, fatGPerKg: .8, sourceType: "external", sourceName: "Clinic", sourceUrl: "https://clinic.example", sourceDate: "2026-07-20" });
  await target.put("templates", { id: "template-1", name: "Lunch", kind: "meal", createdOn: "2026-07-23", records: [{ id: "template-meal", date: "2026-07-23", mealType: "lunch", status: "planned", foodItems: [{ id: "template-food", name: "Rice", caloriesKcal: 180, nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: source }] }] });
  await target.put("customFoods", { id: "custom-1", name: "Protein pudding", servingUnit: "g", nutritionPer100: { caloriesKcal: 120, proteinG: 20, carbohydrateG: 8, fatG: 2 }, dataSource: source });
}

describe("full backup", () => {
  test("round-trips every store, version, and nested source metadata", async () => {
    const source = repository();
    await seedAllStores(source);
    const backup = await exportAll(source, "0.1.0");
    const restored = repository();

    await restoreBackup(restored, backup, "replace");

    expect(backup.schemaVersion).toBe(1);
    expect(backup.appVersion).toBe("0.1.0");
    for (const store of stores) expect(await restored.list(store)).toEqual(backup.stores[store]);
    expect((await restored.get<any>("meals", "meal-1"))?.foodItems[0].dataSource).toMatchObject({ name: "Kitchen scale" });
  });

  test("rejects malformed or incomplete files before any data changes", async () => {
    const target = repository();
    await target.put("plans", { id: "keep", name: "Keep" });
    const before = await target.list("plans");
    const invalid = validateBackup(JSON.stringify({ schemaVersion: 1, appVersion: "0.1.0", exportedAt: "not-a-date", stores: {} }));

    expect(invalid.ok).toBe(false);
    await expect(restoreBackup(target, { schemaVersion: 1, appVersion: "0.1.0", exportedAt: "nope", stores: {} } as any, "replace")).rejects.toThrow(/invalid/i);
    expect(await target.list("plans")).toEqual(before);
  });

  test("merge keeps the newest record for each stable id and replace removes absent records", async () => {
    const source = repository();
    await seedAllStores(source);
    const backup = await exportAll(source, "0.1.0");
    const target = repository();
    await target.put("plans", { id: "custom-plan", name: "New local", updatedAt: "2099-01-01T00:00:00.000Z" });
    await target.put("plans", { id: "local-only", name: "Local only" });

    await restoreBackup(target, backup, "merge");
    expect((await target.get<any>("plans", "custom-plan"))?.name).toBe("New local");
    expect(await target.get("plans", "local-only")).toBeDefined();

    await restoreBackup(target, backup, "replace");
    expect(await target.get("plans", "local-only")).toBeUndefined();
  });
});
