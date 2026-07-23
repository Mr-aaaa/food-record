export type Sex = "male" | "female";

export interface UserProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  activityFactor?: number;
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
  calculation?: {
    formula: "Mifflin-St Jeor";
    activityFactor: number;
    requestedDeficitRatio: number;
    createdAt: string;
    manuallyEdited: boolean;
  };
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  proteinGPerKg: number;
  fatGPerKg: number;
  sourceType: "system" | "external" | "custom";
  sourceName?: string;
  sourceUrl?: string;
  sourceLink?: string;
  sourceDate?: string;
  sourceVerified?: boolean;
  disclaimer?: string;
  /** Preset guidance is informational rather than a medical prescription. */
  isEstimated?: boolean;
  requiresUserConfirmation?: boolean;
  calculationRule?: string;
  calculationInputs?: Record<string, number | string>;
  calculationResult?: MacroTargets;
  applicability?: string;
  enteredOn?: string;
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
  amount?: number;
  unit?: "g" | "ml";
  displayUnit?: DisplayUnit;
  gramsPerDisplayUnit?: number;
  dataSource?: MealDataSource;
}

export type DisplayUnit = "g" | "ml" | "bowl" | "serving" | "spoon" | "piece";

export interface DisplayUnitConversion {
  unit: Exclude<DisplayUnit, "g" | "ml">;
  gramsOrMl: number;
}

export interface CustomFood {
  id: string;
  name: string;
  servingUnit: "g" | "ml";
  nutritionPer100: NutritionTotals;
  dataSource: MealDataSource;
  active?: boolean;
  displayUnits?: DisplayUnitConversion[];
}

export interface MealImportAudit {
  rawText: string;
  originalJson: string;
  normalizedDraft: MealDraft;
  schemaVersion: string;
  warnings: string[];
  source: "external_ai";
  aiProcessedAt: string;
}

export interface MealRecord {
  id: string;
  date: string;
  mealType: MealType;
  status: MealStatus;
  foodItems: FoodItem[];
  audit?: MealImportAudit;
}

export interface MealTemplate {
  id: string;
  name: string;
  kind: "meal" | "day";
  records: MealRecord[];
  createdOn: string;
  tags?: string[];
  defaultMealType?: MealType;
  notes?: string;
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

export interface BodyMetric {
  id: string;
  measuredAt: string;
  weightKg?: number;
  waistCm?: number;
  fasting: boolean;
  notes?: string;
}

export type BodyMetricType = "weightKg" | "waistCm";

export type MealDataSourceType =
  | "user_custom"
  | "builtin_database"
  | "third_party_database"
  | "ai_estimated"
  | "user_manual";

export interface MealDataSource {
  type: MealDataSourceType;
  name: string;
  confidence: number;
  isEstimated: boolean;
}

export type StoreName =
  | "profile"
  | "settings"
  | "targets"
  | "meals"
  | "bodyMetrics"
  | "plans"
  | "templates"
  | "customFoods";

export interface PersistedRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealDraftItem {
  itemId: string;
  foodId: string;
  name: string;
  amount: number | null;
  unit: "g" | "ml";
  isAmbiguous: boolean;
  nutrition: NutritionTotals;
  dataSource: MealDataSource;
}

export interface MealDraft {
  schemaVersion: string;
  recordId: string;
  date: string;
  mealType: MealType;
  status: MealStatus;
  rawText: string;
  items: MealDraftItem[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  canConfirm: boolean;
  cleanedText: string;
  value?: T;
  issues: ValidationIssue[];
}
