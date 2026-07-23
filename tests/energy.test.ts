import {
  applyPlan,
  calculateBmr,
  calculateTarget,
  calculateTdee,
} from "@/domain/energy";

test("calculates male Mifflin-St Jeor BMR", () => {
  expect(
    calculateBmr({ sex: "male", age: 30, heightCm: 175, weightKg: 80 }),
  ).toBe(1748.75);
});

test("calculates TDEE from BMR and activity factor", () => {
  expect(calculateTdee(1500, 1.55)).toBe(2325);
});

test("caps the requested deficit at 25 percent", () => {
  const result = calculateTarget(
    { sex: "male", age: 30, heightCm: 175, weightKg: 80 },
    1.55,
    0.5,
  );

  expect(result.deficitRatio).toBe(0.25);
  expect(result.targetCaloriesKcal).toBe(2032.921875);
});

test("blocks an automatic target below BMR", () => {
  const result = calculateTarget(
    { sex: "female", age: 30, heightCm: 165, weightKg: 60 },
    1.2,
    0.25,
  );

  expect(result.warnings).toContain("目标热量不得低于估算静息能量消耗");
  expect(result.requiresManualReview).toBe(true);
});

test("allocates protein first, fat second, and remaining calories to carbohydrate", () => {
  const targets = applyPlan(2000, 70, {
    id: "balanced",
    name: "Balanced",
    description: "A configurable baseline plan",
    proteinGPerKg: 1.6,
    fatGPerKg: 0.8,
    sourceType: "system",
  });

  expect(targets.proteinG).toBe(112);
  expect(targets.fatG).toBe(56);
  expect(targets.carbohydrateG).toBe(262);
  expect(targets.carbohydrateG).toBeGreaterThanOrEqual(0);
});

test("does not return negative carbohydrate when fixed macros exceed calories", () => {
  const targets = applyPlan(900, 70, {
    id: "balanced",
    name: "Balanced",
    description: "A configurable baseline plan",
    proteinGPerKg: 1.6,
    fatGPerKg: 0.8,
    sourceType: "system",
  });

  expect(targets).toEqual({ proteinG: 112, fatG: 56, carbohydrateG: 0 });
});
