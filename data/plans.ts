import type { PlanDefinition } from "@/domain/types";

export type BuiltInPlan = PlanDefinition & {
  isEstimated: true;
  requiresUserConfirmation: true;
};

const ESTIMATE_NOTICE = "预设宏量营养素数值仅为估算，请根据个人情况确认或调整。";

function plan(
  id: string,
  name: string,
  proteinGPerKg: number,
  fatGPerKg: number,
): BuiltInPlan {
  return {
    id,
    name,
    description: ESTIMATE_NOTICE,
    proteinGPerKg,
    fatGPerKg,
    sourceType: id === "custom" ? "custom" : "system",
    isEstimated: true,
    requiresUserConfirmation: true,
  };
}

export const BUILT_IN_PLANS: readonly BuiltInPlan[] = [
  plan("balanced", "均衡饮食", 1.6, 0.8),
  plan("high-carbohydrate-training", "高碳训练", 1.6, 0.7),
  plan("lower-carbohydrate", "低碳饮食", 1.8, 1),
  plan("custom", "自定义方案", 1.6, 0.8),
];
