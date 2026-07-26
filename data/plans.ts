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

/**
 * 谭成毅按每周运动时长分档的减脂方案。
 * 活动量越大，碳水占比越高；蛋白与脂肪也随训练量微调。
 * 默认采用 2-3 小时/周 档：碳水 2.2、蛋白 1.4、脂肪 0.8 g/kg。
 * 注意：applyPlan 仍按「蛋白质 + 脂肪 g/kg，碳水填充剩余热量」计算，
 * 这里的碳水 g/kg 仅供预览展示与人工对照。
 */
function tanchengyiPlan(): BuiltInPlan {
  return {
    id: "tanchengyi-activity",
    name: "谭成毅 · 按运动量",
    description: "参考谭成毅的按体重换算方案：按每周运动时长分档，三大营养素均按 g/kg 估算。默认采用每周 2-3 小时档。" + ESTIMATE_NOTICE,
    proteinGPerKg: 1.4,
    fatGPerKg: 0.8,
    sourceType: "system",
    sourceName: "谭成毅",
    isEstimated: true,
    requiresUserConfirmation: true,
    calculationRule: "按每周运动时长分档，碳水/蛋白/脂肪均按 g/kg；默认 2-3 小时档",
    calculationInputs: {
      proteinGPerKg: 1.4,
      fatGPerKg: 0.8,
      carbohydrateGPerKg: 2.2,
      tiers: "2-3h: 碳水2.2/蛋白1.4/脂肪0.8；4-5h: 2.5/1.6/0.9；6-7h: 3.0/1.7/1.0；8-9h: 3.5/1.8/1.0",
    },
    applicability: "以减脂为目标、按每周运动时长选择档位的人群",
  };
}

export const BUILT_IN_PLANS: readonly BuiltInPlan[] = [
  tanchengyiPlan(),
  plan("balanced", "均衡饮食", 1.6, 0.8),
  plan("high-carbohydrate-training", "高碳训练", 1.6, 0.7),
  plan("lower-carbohydrate", "低碳饮食", 1.8, 1),
  plan("custom", "自定义方案", 1.6, 0.8),
];