import type {
  DailySnapshot,
  MacroEnergy,
  MacroNutrition,
  MealRecord,
  MealShares,
  NutritionTotals,
  TargetSnapshot,
} from "@/domain/types";

export function macroEnergy(nutrition: MacroNutrition): MacroEnergy {
  const proteinKcal = nutrition.proteinG * 4;
  const carbohydrateKcal = nutrition.carbohydrateG * 4;
  const fatKcal = nutrition.fatG * 9;

  return {
    proteinKcal,
    carbohydrateKcal,
    fatKcal,
    totalMacroKcal: proteinKcal + carbohydrateKcal + fatKcal,
  };
}

export function sumConsumed(records: MealRecord[]): NutritionTotals {
  return records
    .filter((record) => record.status === "consumed")
    .flatMap((record) => record.foodItems)
    .reduce<NutritionTotals>(
      (totals, food) => ({
        caloriesKcal: totals.caloriesKcal + food.caloriesKcal,
        proteinG: totals.proteinG + food.nutrition.proteinG,
        carbohydrateG: totals.carbohydrateG + food.nutrition.carbohydrateG,
        fatG: totals.fatG + food.nutrition.fatG,
      }),
      { caloriesKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 },
    );
}

export function mealShares(records: MealRecord[]): MealShares {
  const caloriesByMeal: MealShares = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };

  for (const record of records) {
    if (record.status !== "consumed") {
      continue;
    }

    caloriesByMeal[record.mealType] += record.foodItems.reduce(
      (calories, food) => calories + food.caloriesKcal,
      0,
    );
  }

  const totalCalories = Object.values(caloriesByMeal).reduce(
    (total, calories) => total + calories,
    0,
  );

  if (totalCalories === 0) {
    return caloriesByMeal;
  }

  return {
    breakfast: caloriesByMeal.breakfast / totalCalories,
    lunch: caloriesByMeal.lunch / totalCalories,
    dinner: caloriesByMeal.dinner / totalCalories,
    snack: caloriesByMeal.snack / totalCalories,
  };
}

export function buildDailySnapshot(
  date: string,
  records: MealRecord[],
  target: TargetSnapshot,
): DailySnapshot {
  return {
    date,
    records,
    target,
    consumed: sumConsumed(records),
    mealShares: mealShares(records),
  };
}
