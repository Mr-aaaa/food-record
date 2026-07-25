import type { MealDataSource, NutritionTotals } from "@/domain/types";

export type FoodCategory =
  | "staple"
  | "protein"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "cooking_oil"
  | "bean"
  | "nut"
  | "drink"
  | "snack";

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  staple: "主食",
  protein: "蛋白质",
  vegetable: "蔬菜",
  fruit: "水果",
  dairy: "乳制品",
  cooking_oil: "油脂",
  bean: "豆类",
  nut: "坚果",
  drink: "饮品",
  snack: "零食",
};

export const FOOD_CATEGORY_ORDER: readonly FoodCategory[] = [
  "staple", "protein", "vegetable", "fruit", "dairy", "bean", "nut", "drink", "snack", "cooking_oil",
];

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
  // 主食
  food("rice-cooked", "米饭（熟）", "staple", 116, 2.6, 25.9, 0.3),
  food("wheat-noodles-cooked", "面条（熟）", "staple", 110, 3.5, 22.8, 0.4),
  food("rice-noodles", "米粉（熟）", "staple", 110, 3.0, 24.0, 0.2),
  food("oats", "燕麦片", "staple", 367, 15, 61.6, 6.7),
  food("sweet-potato", "红薯", "staple", 99, 1.1, 23.1, 0.2),
  food("potato-cooked", "土豆（熟）", "staple", 87, 1.9, 20.0, 0.1),
  food("corn-cooked", "玉米（熟）", "staple", 86, 3.2, 19.0, 1.2),
  food("mantou", "馒头", "staple", 223, 7.0, 47.0, 1.1),
  food("whole-wheat-bread", "全麦面包", "staple", 247, 13.4, 41.0, 3.4),
  food("millet-porridge", "小米粥", "staple", 46, 1.4, 8.4, 0.7),
  food("quinoa-cooked", "藜麦（熟）", "staple", 120, 4.4, 21.3, 1.9),
  // 蛋白质
  food("chicken-breast", "鸡胸肉", "protein", 118, 24.6, 0, 1.9),
  food("chicken-leg", "鸡腿肉（去皮）", "protein", 181, 16.4, 0, 13.0),
  food("egg", "鸡蛋", "protein", 144, 13.3, 2.8, 8.8),
  food("egg-white", "蛋白", "protein", 52, 11.1, 1.5, 0.2),
  food("pork-tenderloin", "猪里脊", "protein", 155, 20.2, 0.7, 7.9),
  food("lean-beef", "牛肉（瘦）", "protein", 125, 20.2, 1.2, 3.5),
  food("lean-lamb", "羊肉（瘦）", "protein", 118, 20.5, 0.2, 3.9),
  food("shrimp", "虾仁", "protein", 87, 18.6, 0.2, 1.3),
  food("salmon", "三文鱼", "protein", 139, 17.2, 0, 7.8),
  food("firm-tofu", "北豆腐", "protein", 81, 8.1, 4.2, 3.7),
  food("tofu-dried", "豆腐干", "protein", 153, 16.2, 4.5, 8.6),
  // 蔬菜
  food("broccoli", "西兰花", "vegetable", 36, 4.1, 4.3, 0.6),
  food("spinach", "菠菜", "vegetable", 28, 2.6, 4.5, 0.3),
  food("tomato", "番茄", "vegetable", 19, 0.9, 4, 0.2),
  food("cucumber", "黄瓜", "vegetable", 15, 0.8, 2.9, 0.2),
  food("carrot", "胡萝卜", "vegetable", 39, 1.0, 8.8, 0.2),
  food("cabbage", "大白菜", "vegetable", 17, 1.5, 3.2, 0.1),
  food("eggplant", "茄子", "vegetable", 23, 1.1, 4.9, 0.2),
  food("green-pepper", "青椒", "vegetable", 22, 1.0, 5.4, 0.2),
  food("lettuce", "生菜", "vegetable", 15, 1.4, 2.9, 0.2),
  food("mushroom", "蘑菇（鲜）", "vegetable", 22, 3.1, 3.3, 0.3),
  food("winter-melon", "冬瓜", "vegetable", 12, 0.4, 2.6, 0.2),
  food("long-bean", "豆角", "vegetable", 31, 1.6, 6.2, 0.2),
  // 水果
  food("apple", "苹果", "fruit", 53, 0.2, 13.7, 0.2),
  food("banana", "香蕉", "fruit", 93, 1.4, 22, 0.2),
  food("orange", "橙子", "fruit", 48, 0.8, 11.1, 0.2),
  food("strawberry", "草莓", "fruit", 32, 1, 7.1, 0.2),
  food("grape", "葡萄", "fruit", 44, 0.5, 10.3, 0.2),
  food("watermelon", "西瓜", "fruit", 30, 0.6, 7.6, 0.1),
  food("pear", "梨", "fruit", 50, 0.4, 13.1, 0.2),
  food("peach", "桃", "fruit", 48, 0.9, 12.2, 0.1),
  food("kiwi", "猕猴桃", "fruit", 61, 0.8, 14.5, 0.6),
  food("mango", "芒果", "fruit", 35, 0.6, 8.3, 0.2),
  // 乳制品
  food("whole-milk", "全脂牛奶", "dairy", 65, 3.3, 5, 3.5, "ml"),
  food("plain-yogurt", "原味酸奶", "dairy", 72, 2.5, 9.3, 2.7),
  food("low-fat-milk", "低脂牛奶", "dairy", 46, 3.4, 5, 1.5, "ml"),
  food("cheddar", "切达奶酪", "dairy", 385, 25.7, 1.3, 31.5),
  food("cheese-slice", "奶酪片", "dairy", 375, 23.0, 2.0, 30.0),
  food("light-cream", "淡奶油", "dairy", 345, 2.8, 3.1, 36.0, "ml"),
  // 豆类
  food("soybean-dry", "黄豆（干）", "bean", 390, 35.0, 34.0, 16.0),
  food("mung-bean-dry", "绿豆（干）", "bean", 329, 21.6, 62.0, 0.8),
  food("red-bean-dry", "红豆（干）", "bean", 324, 20.2, 63.4, 0.6),
  food("chickpea-cooked", "鹰嘴豆（熟）", "bean", 164, 8.9, 27.4, 2.6),
  // 坚果
  food("peanut", "花生（熟）", "nut", 589, 24.8, 21.7, 44.3),
  food("walnut", "核桃", "nut", 654, 14.9, 19.1, 65.2),
  food("almond", "杏仁", "nut", 578, 21.0, 22.0, 50.0),
  food("cashew", "腰果", "nut", 553, 18.2, 30.2, 43.9),
  // 饮品
  food("soy-milk", "豆浆（无糖）", "drink", 31, 3.0, 1.2, 1.6, "ml"),
  food("orange-juice", "橙汁", "drink", 47, 0.7, 11.2, 0.2, "ml"),
  food("cola", "可乐", "drink", 43, 0, 10.6, 0, "ml"),
  food("beer", "啤酒", "drink", 43, 0.5, 3.6, 0, "ml"),
  food("black-coffee", "黑咖啡", "drink", 1, 0.1, 0, 0, "ml"),
  // 零食
  food("dark-chocolate", "黑巧克力", "snack", 546, 4.9, 61.0, 31.0),
  food("potato-chips", "薯片", "snack", 547, 6.6, 53.0, 34.0),
  food("soda-cracker", "苏打饼干", "snack", 421, 9.0, 67.0, 13.0),
  food("cake", "蛋糕", "snack", 347, 4.8, 53.0, 14.0),
  // 油脂
  food("rapeseed-oil", "菜籽油", "cooking_oil", 899, 0, 0, 99.9),
  food("peanut-oil", "花生油", "cooking_oil", 899, 0, 0, 99.9),
  food("olive-oil", "橄榄油", "cooking_oil", 899, 0, 0, 99.9),
  food("sesame-oil", "芝麻油", "cooking_oil", 899, 0, 0, 99.9),
  food("sunflower-oil", "葵花籽油", "cooking_oil", 899, 0, 0, 99.9),
];