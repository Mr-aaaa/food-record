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

export type MealStatus = "planned" | "consumed";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MacroNutrition {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

export interface FoodItem {
  id: string;
  name: string;
  caloriesKcal: number;
  nutrition: MacroNutrition;
}

export interface MealRecord {
  id: string;
  date: string;
  mealType: MealType;
  status: MealStatus;
  foodItems: FoodItem[];
}

export interface NutritionTotals extends MacroNutrition {
  caloriesKcal: number;
}

export interface MacroEnergy {
  proteinKcal: number;
  carbohydrateKcal: number;
  fatKcal: number;
  totalMacroKcal: number;
}

export interface MealShares {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

export interface DailySnapshot {
  date: string;
  records: MealRecord[];
  target: TargetSnapshot;
  consumed: NutritionTotals;
  mealShares: MealShares;
}
