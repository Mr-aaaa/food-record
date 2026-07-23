import {
  normalizeMealDraft,
  parseImportedMeal,
} from "@/domain/input-schema";
import type { MealDraft } from "@/domain/types";

function validMeal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    recordId: "meal_20260723_001",
    date: "2026-07-23",
    mealType: "lunch",
    status: "consumed",
    rawText: "午餐一碗米饭",
    items: [
      {
        itemId: "item_001",
        foodId: "food_rice_cooked",
        name: "熟米饭",
        amount: 300,
        unit: "g",
        nutrition: {
          caloriesKcal: 348,
          proteinG: 7.8,
          fatG: 0.9,
          carbohydrateG: 77.7,
        },
        dataSource: {
          type: "builtin_database",
          name: "内置食物库",
          confidence: 0.95,
          isEstimated: false,
        },
      },
    ],
    warnings: [],
    createdAt: "2026-07-23T12:30:00+08:00",
    updatedAt: "2026-07-23T12:30:00+08:00",
    ...overrides,
  };
}

function validMealJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(validMeal(overrides));
}

test("removes a markdown json fence", () => {
  expect(parseImportedMeal("```json\n{\"schemaVersion\":\"1.0\"}\n```").cleanedText).toBe(
    '{"schemaVersion":"1.0"}',
  );
});

test("accepts a complete supported meal draft", () => {
  const result = parseImportedMeal(validMealJson());

  expect(result).toMatchObject({ ok: true, canConfirm: true, issues: [] });
  expect(result.value?.items[0].nutrition.caloriesKcal).toBe(348);
});

test("rejects an unknown meal type", () => {
  const result = parseImportedMeal(validMealJson({ mealType: "brunch" }));

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("mealType");
});

test("rejects negative nutrition values", () => {
  const result = parseImportedMeal(
    validMealJson({
      items: [
        { ...validMeal().items[0] as object, nutrition: { caloriesKcal: -1, proteinG: 0, fatG: 0, carbohydrateG: 0 } },
      ],
    }),
  );

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("items[0].nutrition.caloriesKcal");
});

test("rejects unsupported units", () => {
  const item = validMeal().items[0] as Record<string, unknown>;
  const result = parseImportedMeal(validMealJson({ items: [{ ...item, unit: "cup" }] }));

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("items[0].unit");
});

test("rejects missing stable IDs", () => {
  const result = parseImportedMeal(validMealJson({ recordId: "" }));

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("recordId");
});

test("rejects incompatible schema versions", () => {
  const result = parseImportedMeal(validMealJson({ schemaVersion: "2.0" }));

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("schemaVersion");
});

test("rejects a calendar-invalid record date", () => {
  const result = parseImportedMeal(validMealJson({ date: "2026-02-30" }));

  expect(result.ok).toBe(false);
  expect(result.issues[0].path).toBe("date");
});

test("keeps a null amount as an incomplete draft that cannot be confirmed", () => {
  const item = validMeal().items[0] as Record<string, unknown>;
  const result = parseImportedMeal(validMealJson({ items: [{ ...item, amount: null }] }));

  expect(result).toMatchObject({ ok: true, canConfirm: false });
  expect(result.issues).toContainEqual({ path: "items[0].amount", message: "需要补充份量" });
});

test("reports every null amount at its original item path", () => {
  const item = validMeal().items[0] as Record<string, unknown>;
  const result = parseImportedMeal(
    validMealJson({
      items: [
        { ...item, amount: null },
        { ...item, itemId: "item_002", amount: 120 },
        { ...item, itemId: "item_003", amount: null },
      ],
    }),
  );

  expect(result.issues.map((issue) => issue.path)).toEqual([
    "items[0].amount",
    "items[2].amount",
  ]);
});

test("normalizes user-facing strings without changing nutrition values", () => {
  const draft = validMeal({ rawText: "  午餐一碗米饭  ", warnings: ["  份量为估算值  "] }) as MealDraft;

  expect(normalizeMealDraft(draft)).toMatchObject({
    rawText: "午餐一碗米饭",
    warnings: ["份量为估算值"],
    items: [{ nutrition: { caloriesKcal: 348 } }],
  });
});
