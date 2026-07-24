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
    await expect(restoreBackup(target, { schemaVersion: 1, appVersion: "0.1.0", exportedAt: "nope", stores: {} } as any, "replace")).rejects.toThrow(/备份无效/);
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

  test("rejects invalid domain values in every store before replace can mutate data", async () => {
    const source = repository();
    await seedAllStores(source);
    const valid = await exportAll(source, "0.1.0");
    const target = repository();
    await target.put("plans", { id: "keep", name: "Untouched" });
    const invalidCases: Array<[StoreName, (backup: any) => void]> = [
      ["profile", (backup) => { backup.stores.profile[0].sex = "unknown"; }],
      ["settings", (backup) => { backup.stores.settings[0].planId = 3; }],
      ["targets", (backup) => { backup.stores.targets[0].macroTargets.proteinG = -1; }],
      ["meals", (backup) => { backup.stores.meals[0].foodItems[0].dataSource.confidence = 2; }],
      ["bodyMetrics", (backup) => { backup.stores.bodyMetrics[0].fasting = "yes"; }],
      ["plans", (backup) => { backup.stores.plans[0].sourceType = "unknown"; }],
      ["templates", (backup) => { backup.stores.templates[0].records[0].mealType = "brunch"; }],
      ["customFoods", (backup) => { backup.stores.customFoods[0].servingUnit = "cup"; }],
    ];

    for (const [store, corrupt] of invalidCases) {
      const backup = structuredClone(valid);
      corrupt(backup);
      expect(validateBackup(JSON.stringify(backup))).toMatchObject({ ok: false });
      await expect(restoreBackup(target, backup, "replace")).rejects.toThrow(/备份无效/);
      expect(await target.get("plans", "keep")).toMatchObject({ name: "Untouched" });
      expect(validateBackup(JSON.stringify(backup)).errors.join(" ")).toContain(`stores.${store}`);
    }
  });

  test("merge preserves an imported newer timestamp so an older backup cannot overwrite it", async () => {
    const source = repository();
    await seedAllStores(source);
    const original = await exportAll(source, "0.1.0");
    const target = repository();
    await target.put("plans", { id: "custom-plan", name: "Existing older" });
    const newer = structuredClone(original);
    newer.stores.plans[0] = { ...newer.stores.plans[0], name: "Imported newest", updatedAt: "2030-01-01T00:00:00.000Z" };

    await restoreBackup(target, newer, "merge");
    expect(await target.get("plans", "custom-plan")).toMatchObject({ name: "Imported newest", updatedAt: "2030-01-01T00:00:00.000Z" });

    const older = structuredClone(original);
    older.stores.plans[0] = { ...older.stores.plans[0], name: "Older backup", updatedAt: "2029-01-01T00:00:00.000Z" };
    await restoreBackup(target, older, "merge");
    expect(await target.get("plans", "custom-plan")).toMatchObject({ name: "Imported newest", updatedAt: "2030-01-01T00:00:00.000Z" });
  });

  test("rejects calendar-invalid timestamps and incorrectly typed optional fields before replace", async () => {
    const source = repository();
    await seedAllStores(source);
    const valid = await exportAll(source, "0.1.0");
    const target = repository();
    await target.put("plans", { id: "keep", name: "Untouched" });
    const invalidCases: Array<(backup: any) => void> = [
      (backup) => { backup.exportedAt = "1"; },
      (backup) => { backup.stores.meals[0].createdAt = "2026-02-30T12:30:00+08:00"; },
      (backup) => { backup.stores.bodyMetrics[0].measuredAt = "2026-02-30T25:61"; },
      (backup) => { backup.stores.profile[0].goalWeightKg = "60"; },
      (backup) => { backup.stores.bodyMetrics[0].notes = { private: true }; },
      (backup) => { backup.stores.plans[0].isEstimated = "false"; },
      (backup) => { backup.stores.plans[0].requiresUserConfirmation = "true"; },
      (backup) => { backup.stores.plans[0].sourceLink = 7; },
      (backup) => { backup.stores.plans[0].sourceVerified = "yes"; },
      (backup) => { backup.stores.plans[0].disclaimer = false; },
    ];

    for (const corrupt of invalidCases) {
      const backup = structuredClone(valid);
      corrupt(backup);
      expect(validateBackup(JSON.stringify(backup))).toMatchObject({ ok: false });
      await expect(restoreBackup(target, backup, "replace")).rejects.toThrow(/备份无效/);
      expect(await target.get("plans", "keep")).toMatchObject({ name: "Untouched" });
    }
  });
});
