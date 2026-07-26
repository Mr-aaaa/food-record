import { BUILT_IN_FOODS } from "@/data/foods";
import { BUILT_IN_PLANS } from "@/data/plans";
import { createIndexedDbRepository } from "@/storage/indexed-db";

let databaseSequence = 0;

function databaseName() {
  databaseSequence += 1;
  return `food-calorie-test-${databaseSequence}`;
}

test("ships common Chinese foods with per-100 nutrition and built-in source metadata", () => {
  expect(BUILT_IN_FOODS.length).toBeGreaterThanOrEqual(60);
  expect(new Set(BUILT_IN_FOODS.map((food) => food.category))).toEqual(
    new Set(["staple", "protein", "vegetable", "fruit", "dairy", "cooking_oil", "bean", "nut", "drink", "snack"]),
  );

  for (const food of BUILT_IN_FOODS) {
    expect(food.nutritionPer100.caloriesKcal).toBeGreaterThanOrEqual(0);
    expect(food.source).toMatchObject({
      type: "builtin_database",
      isEstimated: true,
    });
  }
});

test("ships configurable estimate plans that require confirmation", () => {
  expect(BUILT_IN_PLANS.map((plan) => plan.id)).toEqual([
    "tanchengyi-activity",
    "balanced",
    "high-carbohydrate-training",
    "lower-carbohydrate",
    "custom",
  ]);
  expect(BUILT_IN_PLANS.every((plan) => plan.isEstimated && plan.requiresUserConfirmation)).toBe(true);
});

test("puts, retrieves, updates, and removes records with stable ids and timestamps", async () => {
  const repository = createIndexedDbRepository(databaseName());

  const created = await repository.put("plans", { name: "My plan" });
  expect(created.id).toEqual(expect.any(String));
  expect(created.createdAt).toEqual(expect.any(String));
  expect(created.updatedAt).toBe(created.createdAt);
  expect(await repository.get("plans", created.id)).toEqual(created);

  const updated = await repository.put("plans", { ...created, name: "Updated plan" });
  expect(updated.id).toBe(created.id);
  expect(updated.createdAt).toBe(created.createdAt);
  expect(updated.updatedAt >= created.updatedAt).toBe(true);
  expect((await repository.get<typeof updated>("plans", created.id))?.name).toBe("Updated plan");

  await repository.remove("plans", created.id);
  expect(await repository.get("plans", created.id)).toBeUndefined();
});

test("persists records across repository instances with the same database name", async () => {
  const name = databaseName();
  const first = createIndexedDbRepository(name);
  const created = await first.put("customFoods", { name: "自制鸡胸肉" });
  const second = createIndexedDbRepository(name);

  expect(await second.get("customFoods", created.id)).toEqual(created);
  expect(await second.list("customFoods")).toEqual([created]);
});

test("aborts a failed multi-store transaction without persisting earlier writes", async () => {
  const repository = createIndexedDbRepository(databaseName());

  await expect(
    repository.transaction(["plans", "customFoods"], async (transaction) => {
      await transaction.put("plans", { id: "plan-1", name: "Discarded plan" });
      await transaction.put("customFoods", { id: "food-1", name: "Discarded food" });
      throw new Error("cancel transaction");
    }),
  ).rejects.toThrow("cancel transaction");

  expect(await repository.list("plans")).toEqual([]);
  expect(await repository.list("customFoods")).toEqual([]);
});
