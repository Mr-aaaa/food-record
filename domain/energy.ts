import type {
  MacroTargets,
  PlanDefinition,
  TargetResult,
  UserProfile,
} from "@/domain/types";

const MAX_DEFICIT_RATIO = 0.25;
const BMR_WARNING = "目标热量不得低于估算静息能量消耗";

export function calculateBmr(profile: UserProfile): number {
  const sexAdjustment = profile.sex === "male" ? 5 : -161;

  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment;
}

export function calculateTdee(bmr: number, activityFactor: number): number {
  return bmr * activityFactor;
}

export function calculateTarget(
  profile: UserProfile,
  activityFactor: number,
  deficitRatio: number,
): TargetResult {
  const bmrKcal = calculateBmr(profile);
  const tdeeKcal = calculateTdee(bmrKcal, activityFactor);
  const cappedDeficitRatio = Math.min(deficitRatio, MAX_DEFICIT_RATIO);
  const targetCaloriesKcal = tdeeKcal * (1 - cappedDeficitRatio);
  const requiresManualReview = targetCaloriesKcal < bmrKcal;

  return {
    bmrKcal,
    tdeeKcal,
    targetCaloriesKcal,
    deficitRatio: cappedDeficitRatio,
    warnings: requiresManualReview ? [BMR_WARNING] : [],
    requiresManualReview,
  };
}

export function applyPlan(
  targetCaloriesKcal: number,
  bodyWeightKg: number,
  plan: PlanDefinition,
): MacroTargets {
  const proteinG = plan.proteinGPerKg * bodyWeightKg;
  const fatG = plan.fatGPerKg * bodyWeightKg;
  const remainingCalories = targetCaloriesKcal - proteinG * 4 - fatG * 9;

  return {
    proteinG,
    fatG,
    carbohydrateG: Math.max(0, remainingCalories / 4),
  };
}
