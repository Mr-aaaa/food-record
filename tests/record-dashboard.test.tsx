import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";
import { localDateKey } from "@/domain/local-date";
import { parseImportedMeal } from "@/domain/input-schema";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import type { AppRepository } from "@/storage/repository";

let sequence = 0;
const date = () => localDateKey(new Date());
const repo = () => createIndexedDbRepository(`record-dashboard-${++sequence}`);

async function seed(repository: ReturnType<typeof repo>, records: object[] = []) {
  await repository.put("profile", { id: "current", sex: "female", age: 30, heightCm: 165, weightKg: 60 });
  await repository.put("settings", { id: "onboarding", planId: "balanced" });
  await repository.put("targets", { id: "current", calculationDate: date(), sourceProfile: { sex: "female", age: 30, heightCm: 165, weightKg: 60 }, target: { bmrKcal: 1300, tdeeKcal: 1800, targetCaloriesKcal: 1500, deficitRatio: .15, warnings: [], requiresManualReview: false }, macroTargets: { proteinG: 100, carbohydrateG: 150, fatG: 55 }, planId: "balanced" });
  for (const record of records) await repository.put("meals", record);
}

function draft(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: "1.0", recordId: "two-items", date: date(), mealType: "lunch", status: "consumed", rawText: "meal", warnings: [], createdAt: "2026-07-23T08:00:00+08:00", updatedAt: "2026-07-23T08:00:00+08:00", items: [
    { itemId: "one", foodId: "one", name: "One", amount: 100, unit: "g", isAmbiguous: false, nutrition: { caloriesKcal: 100, proteinG: 10, carbohydrateG: 5, fatG: 2 }, dataSource: { type: "builtin_database", name: "Built-in", confidence: 1, isEstimated: false } },
    { itemId: "two", foodId: "two", name: "Two", amount: 100, unit: "g", isAmbiguous: false, nutrition: { caloriesKcal: 200, proteinG: 20, carbohydrateG: 10, fatG: 4 }, dataSource: { type: "user_manual", name: "Manual", confidence: 1, isEstimated: false } },
  ], ...overrides };
}

test("uses local calendar dates instead of UTC at a timezone boundary", () => {
  expect(localDateKey(new Date("2026-07-22T16:30:00.000Z"))).toBe("2026-07-23");
});

test("ambiguous imported items are valid JSON drafts but cannot be confirmed", () => {
  const result = parseImportedMeal(JSON.stringify(draft({ items: [{ ...draft().items[0], isAmbiguous: true }] })));
  expect(result).toMatchObject({ ok: true, canConfirm: false });
  expect(result.issues.map((issue) => issue.path)).toContain("items[0].isAmbiguous");
});

test("date-isolated dashboard excludes yesterday and tomorrow and stale validation clears on edit", async () => {
  const repository = repo();
  const current = date();
  await seed(repository, [{ id: "today", date: current, mealType: "breakfast", status: "consumed", foodItems: [{ id: "today-food", name: "Today food", caloriesKcal: 100, nutrition: { proteinG: 10, carbohydrateG: 5, fatG: 2 }, dataSource: { type: "user_manual", name: "Today source", confidence: 1, isEstimated: false } }] }, { id: "past", date: "2020-01-01", mealType: "breakfast", status: "consumed", foodItems: [{ id: "past-food", name: "Past food", caloriesKcal: 900, nutrition: { proteinG: 0, carbohydrateG: 0, fatG: 0 } }] }, { id: "future", date: "2099-01-01", mealType: "dinner", status: "planned", foodItems: [{ id: "future-food", name: "Future food", caloriesKcal: 800, nutrition: { proteinG: 0, carbohydrateG: 0, fatG: 0 } }] }]);
  render(<HomePage repository={repository} />);
  await waitFor(() => expect(screen.getByRole("table", { name: "Daily nutrition details" })).toHaveTextContent("100 kcal"));
  const table = screen.getByRole("table", { name: "Daily nutrition details" });
  expect(table).toHaveTextContent("10 g");
  expect(table).toHaveTextContent("Breakfast");
  expect(screen.getByText("Planned calories").parentElement).toHaveTextContent("0");
  expect(screen.getAllByText("Source: Today source")).not.toHaveLength(0);
  expect(screen.queryByText("Past food")).not.toBeInTheDocument();
  expect(screen.queryByText("Future food")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: JSON.stringify(draft()) } });
  fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
  expect(await screen.findByRole("button", { name: "Confirm meal" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: "{" } });
  expect(screen.queryByRole("button", { name: "Confirm meal" })).not.toBeInTheDocument();
});

test("item controls split imported multi-item records and retain item source badges", async () => {
  const repository = repo();
  await seed(repository);
  render(<HomePage repository={repository} />);
  await screen.findByRole("heading", { name: "Today" });
  fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: JSON.stringify(draft()) } });
  fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm meal" }));
  await screen.findByRole("button", { name: "Copy One" });
  fireEvent.click(screen.getByRole("button", { name: "Move Two" }));
  fireEvent.change(screen.getByLabelText("Move copied meal to"), { target: { value: "dinner" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));
  await waitFor(async () => expect(await repository.get("meals", "two-items")).toMatchObject({ foodItems: [{ name: "One" }] }));
  expect(screen.getAllByText("Source: Built-in")).not.toHaveLength(0);
  expect(screen.getAllByText("Source: Manual")).not.toHaveLength(0);
});

test("surfaces custom food and item operation persistence failures", async () => {
  const backing = repo();
  await seed(backing, [{ id: "failure-meal", date: date(), mealType: "lunch", status: "consumed", foodItems: [{ id: "failure-food", name: "Failure food", caloriesKcal: 50, nutrition: { proteinG: 1, carbohydrateG: 1, fatG: 1 } }] }]);
  let allowRemove = false;
  const failing: AppRepository = { ...backing, put: async () => { throw new Error("write failed"); }, remove: async (...args) => { if (allowRemove) return backing.remove(...args); throw new Error("remove failed"); }, transaction: async () => { throw new Error("transaction failed"); } };
  render(<HomePage repository={failing} />);
  await screen.findByRole("button", { name: "Copy Failure food" });
  fireEvent.click(screen.getByRole("button", { name: "Copy Failure food" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy food");
  fireEvent.click(screen.getByRole("button", { name: "Move Failure food" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not move food");
  fireEvent.change(screen.getByLabelText("Custom food name"), { target: { value: "Broken food" } });
  fireEvent.change(screen.getByLabelText("Custom calories per 100"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Custom protein per 100"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save custom food" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save custom food");
  allowRemove = true;
  fireEvent.click(screen.getByRole("button", { name: "Delete Failure food" }));
  expect(await screen.findByRole("button", { name: "Undo delete" })).toBeInTheDocument();
  allowRemove = false;
  fireEvent.click(screen.getByRole("button", { name: "Undo delete" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not undo delete");
});
