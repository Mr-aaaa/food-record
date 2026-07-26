import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@/src/App";
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
  const localFields = { getFullYear: () => 2026, getMonth: () => 6, getDate: () => 23 } as unknown as Date;
  expect(localDateKey(localFields)).toBe("2026-07-23");
});

test("ambiguous imported items are valid JSON drafts that can be confirmed", () => {
  const result = parseImportedMeal(JSON.stringify(draft({ items: [{ ...draft().items[0], isAmbiguous: true }] })));
  expect(result).toMatchObject({ ok: true, canConfirm: true });
  expect(result.issues.map((issue) => issue.path)).not.toContain("items[0].isAmbiguous");
});

test("date-isolated dashboard excludes yesterday and tomorrow and stale validation clears on edit", async () => {
  const repository = repo();
  const current = date();
  await seed(repository, [{ id: "today", date: current, mealType: "breakfast", status: "consumed", foodItems: [{ id: "today-food", name: "Today food", caloriesKcal: 100, nutrition: { proteinG: 10, carbohydrateG: 5, fatG: 2 }, dataSource: { type: "user_manual", name: "Today source", confidence: 1, isEstimated: false } }] }, { id: "past", date: "2020-01-01", mealType: "breakfast", status: "consumed", foodItems: [{ id: "past-food", name: "Past food", caloriesKcal: 900, nutrition: { proteinG: 0, carbohydrateG: 0, fatG: 0 } }] }, { id: "future", date: "2099-01-01", mealType: "dinner", status: "planned", foodItems: [{ id: "future-food", name: "Future food", caloriesKcal: 800, nutrition: { proteinG: 0, carbohydrateG: 0, fatG: 0 } }] }]);
  render(<App repository={repository} />);
  await waitFor(() => expect(screen.getByRole("table", { name: "每日营养详情" })).toHaveTextContent("100 千卡"));
  const table = screen.getByRole("table", { name: "每日营养详情" });
  expect(table).toHaveTextContent("10 g");
  expect(table).toHaveTextContent("早餐");
  expect(table).toHaveTextContent("1500 千卡");
  expect(screen.getByText("剩余").parentElement).toHaveTextContent("1400");
  expect(screen.getAllByText(/热量占比 51%/).length).toBeGreaterThan(0);
  expect(table).toHaveTextContent("100%");
  expect(screen.getByText("计划热量").parentElement).toHaveTextContent("0");
  expect(screen.queryByText("Past food")).not.toBeInTheDocument();
  expect(screen.queryByText("Future food")).not.toBeInTheDocument();
      fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
    fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: JSON.stringify(draft()) } });
  fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
  expect(await screen.findByRole("button", { name: "确认导入" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: "{" } });
  expect(screen.queryByRole("button", { name: "确认导入" })).not.toBeInTheDocument();
});

test("item controls split imported multi-item records and retain item source badges", async () => {
  const repository = repo();
  await seed(repository);
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: JSON.stringify(draft()) } });
  fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await screen.findByRole("button", { name: "复制 One" });
  fireEvent.click(screen.getByRole("button", { name: "复制 One" }));
  await waitFor(async () => expect(await repository.list("meals")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: "移动 Two" }));
  fireEvent.change(screen.getByLabelText("移动到的餐次"), { target: { value: "dinner" } });
  fireEvent.click(screen.getByRole("button", { name: "确认移动" }));
  await waitFor(async () => expect(await repository.get("meals", "two-items")).toMatchObject({ foodItems: [{ name: "One" }] }));
  expect(screen.getAllByText(/来源：Built-in/)).not.toHaveLength(0);
  expect(screen.getAllByText(/来源：Manual/)).not.toHaveLength(0);
  fireEvent.click(screen.getAllByRole("button", { name: "删除 One" })[0]);
  expect(await screen.findByRole("button", { name: "撤销删除" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
  await waitFor(async () => expect(await repository.get("meals", "two-items")).toMatchObject({ foodItems: [{ name: "One" }] }));
});

test("manual entries persist the selected food's supported unit", async () => {
  const repository = repo();
  await seed(repository);
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.change(screen.getByLabelText("食物"), { target: { value: "whole-milk" } });
  expect(screen.getByLabelText("单位")).toHaveValue("ml");
  fireEvent.change(screen.getByLabelText("份量"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "添加到当日" }));
  await waitFor(async () => expect((await repository.list("meals")).at(-1)).toMatchObject({ foodItems: [{ amount: 200, unit: "ml" }] }));
});

test("creating a custom food resets a prior milliliter unit selection to grams", async () => {
  const repository = repo();
  await seed(repository);
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.change(screen.getByLabelText("食物"), { target: { value: "whole-milk" } });
  expect(screen.getByLabelText("单位")).toHaveValue("ml");
  fireEvent.change(screen.getByLabelText("自定义食物名称"), { target: { value: "Custom oats" } });
  fireEvent.change(screen.getByLabelText("每 100 克热量"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("每 100 克蛋白质"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "保存自定义食物" }));
  await waitFor(() => expect(screen.getByLabelText("单位")).toHaveValue("g"));
});

test("surfaces custom food and item operation persistence failures", async () => {
  const backing = repo();
  await seed(backing, [{ id: "failure-meal", date: date(), mealType: "lunch", status: "consumed", foodItems: [{ id: "failure-food", name: "Failure food", caloriesKcal: 50, nutrition: { proteinG: 1, carbohydrateG: 1, fatG: 1 } }] }]);
  let allowRemove = false;
  const failing: AppRepository = { ...backing, put: async () => { throw new Error("write failed"); }, remove: async (...args) => { if (allowRemove) return backing.remove(...args); throw new Error("remove failed"); }, transaction: async () => { throw new Error("transaction failed"); } };
  render(<App repository={failing} />);
  await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  await screen.findByRole("button", { name: "复制 Failure food" });
  fireEvent.click(screen.getByRole("button", { name: "复制 Failure food" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法复制食物");
  fireEvent.click(screen.getByRole("button", { name: "移动 Failure food" }));
  fireEvent.click(screen.getByRole("button", { name: "确认移动" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法移动食物");
  fireEvent.change(screen.getByLabelText("自定义食物名称"), { target: { value: "Broken food" } });
  fireEvent.change(screen.getByLabelText("每 100 克热量"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("每 100 克蛋白质"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "保存自定义食物" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法保存自定义食物");
  allowRemove = true;
  fireEvent.click(screen.getByRole("button", { name: "删除 Failure food" }));
  expect(await screen.findByRole("button", { name: "撤销删除" })).toBeInTheDocument();
  allowRemove = false;
  fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("无法撤销删除");
});
