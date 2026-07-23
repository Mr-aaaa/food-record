import type { MealDataSource, NutritionTotals } from "@/domain/types";

export type FoodCategory =
  | "staple"
  | "protein"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "cooking_oil";

export interface BuiltInFood {
  id: string;
  name: string;
  category: FoodCategory;
  servingUnit: "g" | "ml";
  nutritionPer100: NutritionTotals;
  source: MealDataSource;
}

const BUILT_IN_SOURCE: MealDataSource = {
  type: "builtin_database",
  name: "内置食物营养数据库（估算值）",
  confidence: 0.7,
  isEstimated: true,
};

function food(
  id: string,
  name: string,
  category: FoodCategory,
  caloriesKcal: number,
  proteinG: number,
  carbohydrateG: number,
  fatG: number,
  servingUnit: "g" | "ml" = "g",
): BuiltInFood {
  return {
    id,
    name,
    category,
    servingUnit,
    nutritionPer100: { caloriesKcal, proteinG, carbohydrateG, fatG },
    source: { ...BUILT_IN_SOURCE },
  };
}

/** Common foods; nutrition is per 100g or 100ml and is an estimate to confirm. */
export const BUILT_IN_FOODS: readonly BuiltInFood[] = [
  food("rice-cooked", "米饭（熟）", "staple", 116, 2.6, 25.9, 0.3),
  food("wheat-noodles-cooked", "面条（熟）", "staple", 110, 3.5, 22.8, 0.4),
  food("oats", "燕麦片", "staple", 367, 15, 61.6, 6.7),
  food("sweet-potato", "红薯", "staple", 99, 1.1, 23.1, 0.2),
  food("chicken-breast", "鸡胸肉", "protein", 118, 24.6, 0, 1.9),
  food("egg", "鸡蛋", "protein", 144, 13.3, 2.8, 8.8),
  food("pork-tenderloin", "猪里脊", "protein", 155, 20.2, 0.7, 7.9),
  food("firm-tofu", "北豆腐", "protein", 81, 8.1, 4.2, 3.7),
  food("broccoli", "西兰花", "vegetable", 36, 4.1, 4.3, 0.6),
  food("spinach", "菠菜", "vegetable", 28, 2.6, 4.5, 0.3),
  food("tomato", "番茄", "vegetable", 19, 0.9, 4, 0.2),
  food("cucumber", "黄瓜", "vegetable", 15, 0.8, 2.9, 0.2),
  food("apple", "苹果", "fruit", 53, 0.2, 13.7, 0.2),
  food("banana", "香蕉", "fruit", 93, 1.4, 22, 0.2),
  food("orange", "橙子", "fruit", 48, 0.8, 11.1, 0.2),
  food("strawberry", "草莓", "fruit", 32, 1, 7.1, 0.2),
  food("whole-milk", "全脂牛奶", "dairy", 65, 3.3, 5, 3.5, "ml"),
  food("plain-yogurt", "原味酸奶", "dairy", 72, 2.5, 9.3, 2.7),
  food("low-fat-milk", "低脂牛奶", "dairy", 46, 3.4, 5, 1.5, "ml"),
  food("cheddar", "切达奶酪", "dairy", 385, 25.7, 1.3, 31.5),
  food("rapeseed-oil", "菜籽油", "cooking_oil", 899, 0, 0, 99.9),
  food("peanut-oil", "花生油", "cooking_oil", 899, 0, 0, 99.9),
  food("olive-oil", "橄榄油", "cooking_oil", 899, 0, 0, 99.9),
  food("sesame-oil", "芝麻油", "cooking_oil", 899, 0, 0, 99.9),
  food("sunflower-oil", "葵花籽油", "cooking_oil", 899, 0, 0, 99.9),
];
