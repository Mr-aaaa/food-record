import type {
  MacroTargets,
  PlanDefinition,
  TargetResult,
  UserProfile,
} from "@/domain/types";

const MAX_DEFICIT_RATIO = 0.25;
const AGGRESSIVE_DEFICIT_WARNING = "减脂幅度过大：自动目标的热量缺口不得超过 25%。";

export function evaluateProfileSafety(profile: UserProfile): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 120) {
    reasons.push("年龄必须是 18 到 120 之间的整数。");
  }
  if (profile.goalWeightKg) {
    const goalBmi = profile.goalWeightKg / ((profile.heightCm / 100) ** 2);
    if (goalBmi < 18.5 || goalBmi > 40) {
      reasons.push(`目标 BMI ${goalBmi.toFixed(1)} 超出支持的 18.5–40 范围。`);
    }
  }
  return { blocked: reasons.length > 0, reasons };
}
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
  const targetCaloriesKcal = tdeeKcal * (1 - deficitRatio);
  const aggressive = deficitRatio > MAX_DEFICIT_RATIO;
  const requiresManualReview = targetCaloriesKcal < bmrKcal || aggressive;
  const warnings = [
    ...(targetCaloriesKcal < bmrKcal ? [BMR_WARNING] : []),
    ...(aggressive ? [AGGRESSIVE_DEFICIT_WARNING] : []),
  ];

  return {
    bmrKcal,
    tdeeKcal,
    targetCaloriesKcal,
    deficitRatio,
    warnings,
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
