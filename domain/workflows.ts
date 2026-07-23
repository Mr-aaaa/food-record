import { applyPlan } from "@/domain/energy";
import type { MealDraft, MealRecord, PlanDefinition, TargetSnapshot } from "@/domain/types";

export function createDailyTargetSnapshot(
  previous: TargetSnapshot,
  plan: PlanDefinition,
  date: string,
): TargetSnapshot {
  return {
    ...structuredClone(previous),
    calculationDate: date,
    sourceProfile: { ...previous.sourceProfile },
    macroTargets: applyPlan(previous.target.targetCaloriesKcal, previous.sourceProfile.weightKg, plan),
    planId: plan.id,
    calculation: {
      formula: "Mifflin-St Jeor",
      activityFactor: previous.sourceProfile.activityFactor,
      requestedDeficitRatio: previous.target.deficitRatio,
      createdAt: new Date().toISOString(),
      manuallyEdited: previous.calculation?.manuallyEdited ?? false,
    },
  };
}

export function mealRecordFromDraft(
  draft: MealDraft,
  originalJson: string,
  aiProcessedAt = new Date().toISOString(),
): MealRecord {
  const normalizedDraft = structuredClone(draft);
  return {
    id: draft.recordId,
    date: draft.date,
    mealType: draft.mealType,
    status: draft.status,
    foodItems: draft.items.map((item) => ({
      id: item.itemId,
      name: item.name,
      caloriesKcal: item.nutrition.caloriesKcal,
      nutrition: {
        proteinG: item.nutrition.proteinG,
        carbohydrateG: item.nutrition.carbohydrateG,
        fatG: item.nutrition.fatG,
      },
      amount: item.amount ?? undefined,
      unit: item.unit,
      dataSource: { ...item.dataSource },
    })),
    audit: {
      rawText: draft.rawText,
      originalJson,
      normalizedDraft,
      schemaVersion: draft.schemaVersion,
      warnings: [...draft.warnings],
      source: "external_ai",
      aiProcessedAt,
    },
  };
}
