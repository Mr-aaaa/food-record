import {
  buildDailySnapshot,
  macroEnergy,
  mealShares,
  sumConsumed,
} from "@/domain/nutrition";

function meal(
  status: "consumed" | "planned",
  caloriesKcal: number,
  mealType: "breakfast" | "lunch" | "dinner" | "snack" = "breakfast",
) {
  return {
    id: `meal-${status}-${caloriesKcal}`,
    date: "2026-07-23",
    mealType,
    status,
    foodItems: [
      {
        id: `food-${caloriesKcal}`,
        name: "Test food",
        caloriesKcal,
        nutrition: { proteinG: 0, carbohydrateG: 0, fatG: 0 },
      },
    ],
  };
}

test("converts macros to energy with 4 4 9", () => {
  expect(
    macroEnergy({ proteinG: 10, carbohydrateG: 20, fatG: 5 }),
  ).toEqual({
    proteinKcal: 40,
    carbohydrateKcal: 80,
    fatKcal: 45,
    totalMacroKcal: 165,
  });
});

test("excludes planned meals from consumed totals", () => {
  const totals = sumConsumed([meal("consumed", 300), meal("planned", 500)]);

  expect(totals.caloriesKcal).toBe(300);
});

test("sums consumed calories and macros across food items", () => {
  const totals = sumConsumed([
    {
      ...meal("consumed", 300),
      foodItems: [
        {
          id: "food-one",
          name: "Food one",
          caloriesKcal: 300,
          nutrition: { proteinG: 20, carbohydrateG: 30, fatG: 10 },
        },
        {
          id: "food-two",
          name: "Food two",
          caloriesKcal: 120,
          nutrition: { proteinG: 5, carbohydrateG: 10, fatG: 4 },
        },
      ],
    },
  ]);

  expect(totals).toEqual({
    caloriesKcal: 420,
    proteinG: 25,
    carbohydrateG: 40,
    fatG: 14,
  });
});

test("calculates shares for breakfast, lunch, dinner, and snacks", () => {
  expect(
    mealShares([
      meal("consumed", 100, "breakfast"),
      meal("consumed", 200, "lunch"),
      meal("consumed", 300, "dinner"),
      meal("consumed", 400, "snack"),
    ]),
  ).toEqual({ breakfast: 0.1, lunch: 0.2, dinner: 0.3, snack: 0.4 });
});

test("returns zero totals for an empty day", () => {
  expect(sumConsumed([])).toEqual({
    caloriesKcal: 0,
    proteinG: 0,
    carbohydrateG: 0,
    fatG: 0,
  });
});

test("calculates unrounded shares for each consumed meal type", () => {
  const shares = mealShares([
    meal("consumed", 100, "breakfast"),
    meal("consumed", 100, "lunch"),
    meal("consumed", 100, "dinner"),
    meal("planned", 700, "snack"),
  ]);

  expect(shares).toEqual({
    breakfast: 1 / 3,
    lunch: 1 / 3,
    dinner: 1 / 3,
    snack: 0,
  });
  expect(Object.values(shares).reduce((total, share) => total + share, 0)).toBe(1);
});

test("returns zero meal shares for an empty day", () => {
  expect(mealShares([])).toEqual({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  });
});

test("builds a daily snapshot without replacing the supplied target", () => {
  const target = {
    calculationDate: "2026-07-23",
    sourceProfile: { sex: "female" as const, age: 30, heightCm: 165, weightKg: 60 },
    target: {
      bmrKcal: 1300,
      tdeeKcal: 1800,
      targetCaloriesKcal: 1500,
      deficitRatio: 1 / 6,
      warnings: [],
      requiresManualReview: false,
    },
    macroTargets: { proteinG: 100, carbohydrateG: 150, fatG: 55 },
    planId: "balanced",
  };
  const records = [
    meal("consumed", 300, "breakfast"),
    meal("planned", 500, "dinner"),
  ];

  const snapshot = buildDailySnapshot("2026-07-23", records, target);

  expect(snapshot.date).toBe("2026-07-23");
  expect(snapshot.records).toBe(records);
  expect(snapshot.target).toBe(target);
  expect(snapshot.consumed.caloriesKcal).toBe(300);
  expect(snapshot.mealShares).toEqual({
    breakfast: 1,
    lunch: 0,
    dinner: 0,
    snack: 0,
  });
});
