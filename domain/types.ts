export type Sex = "male" | "female";

export interface UserProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
}

export interface TargetResult {
  bmrKcal: number;
  tdeeKcal: number;
  targetCaloriesKcal: number;
  deficitRatio: number;
  warnings: string[];
  requiresManualReview: boolean;
}

export interface MacroTargets {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

export interface TargetSnapshot {
  calculationDate: string;
  sourceProfile: UserProfile;
  target: TargetResult;
  macroTargets: MacroTargets;
  planId: string;
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  proteinGPerKg: number;
  fatGPerKg: number;
  sourceType: "system" | "external" | "custom";
}
