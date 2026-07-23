import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { localDateKey } from "@/domain/local-date";
import { cloneTemplateRecords, currentCalculationDate } from "@/state/app-store";
import AppShell from "@/components/AppShell";
import HomePage from "@/app/page";

let databaseSequence = 0;

const today = () => localDateKey(new Date());

function createTestRepository() {
  databaseSequence += 1;
  return createIndexedDbRepository(`app-onboarding-test-${databaseSequence}`);
}

function fillValidProfile() {
  fireEvent.change(screen.getByLabelText("年龄"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("身高（厘米）"), { target: { value: "175" } });
  fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "80" } });
}

test("onboarding calculates an estimated target and persists only after confirmation", async () => {
  const repository = createTestRepository();
  render(<HomePage repository={repository} />);

  expect(await screen.findByRole("heading", { name: "设置你的目标" })).toBeInTheDocument();
  expect(screen.getByLabelText("性别")).toBeInTheDocument();
  expect(screen.getByLabelText("年龄")).toBeInTheDocument();
  expect(screen.getByLabelText("身高（厘米）")).toBeInTheDocument();
  expect(screen.getByLabelText("体重（千克）")).toBeInTheDocument();

  fillValidProfile();
  fireEvent.click(screen.getByRole("button", { name: "计算目标" }));

  expect(await screen.findByText("预计每日热量")).toBeInTheDocument();
  expect(screen.getByText("这是一项基于资料的估算，实际需求会随活动和身体状况变化。")).toBeInTheDocument();
  expect(screen.getByText("如有疾病管理、孕哺期或饮食困扰，请先咨询专业人士。")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "今日" })).not.toBeInTheDocument();

  expect(await repository.list("profile")).toEqual([]);
  expect(await repository.list("settings")).toEqual([]);
  expect(await repository.list("targets")).toEqual([]);

  fireEvent.click(screen.getByLabelText("均衡饮食"));
  fireEvent.click(screen.getByRole("button", { name: "确认并开始记录" }));

  expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();

  await waitFor(async () => {
    expect(await repository.list("profile")).toHaveLength(1);
    expect(await repository.list("settings")).toHaveLength(1);
    expect(await repository.list("targets")).toHaveLength(1);
  });

  expect(await repository.get("settings", "onboarding")).toMatchObject({ planId: "balanced" });
  expect(await repository.get("targets", "current")).toMatchObject({
    calculationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    sourceProfile: { sex: "female", age: 30, heightCm: 175, weightKg: 80 },
    planId: "balanced",
  });
});

async function seedOnboardedUser(repository: ReturnType<typeof createTestRepository>) {
  await repository.put("profile", { id: "current", sex: "female", age: 30, heightCm: 165, weightKg: 60 });
  await repository.put("settings", { id: "onboarding", planId: "balanced" });
  await repository.put("targets", {
    id: "current", calculationDate: today(), sourceProfile: { sex: "female", age: 30, heightCm: 165, weightKg: 60 },
    target: { bmrKcal: 1300, tdeeKcal: 1800, targetCaloriesKcal: 1500, deficitRatio: 1 / 6, warnings: [], requiresManualReview: false },
    macroTargets: { proteinG: 100, carbohydrateG: 150, fatG: 55 }, planId: "balanced",
  });
}

function importedMealJson(amount: number | null = 100) {
  return JSON.stringify({ schemaVersion: "1.0", recordId: "imported-meal-1", date: today(), mealType: "breakfast", status: "consumed", rawText: "two eggs",
    items: [{ itemId: "imported-item-1", foodId: "egg", name: "Egg", amount, unit: "g", isAmbiguous: false, nutrition: { caloriesKcal: 144, proteinG: 13.3, carbohydrateG: 2.8, fatG: 8.8 }, dataSource: { type: "builtin_database", name: "Built-in database", confidence: 0.7, isEstimated: true } }],
    warnings: amount === null ? ["amount needs confirmation"] : [], createdAt: `${today()}T08:00:00+08:00`, updatedAt: `${today()}T08:00:00+08:00` });
}

test("portable prompt can be copied, validates pasted fenced JSON, previews and confirms only complete entries", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  const copied: string[] = [];
  render(<HomePage repository={repository} clipboard={{ writeText: async (text: string) => { copied.push(text); } }} />);
  await screen.findByRole("heading", { name: "Today" });
  fireEvent.change(screen.getByLabelText("Natural language meal"), { target: { value: "two eggs" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate portable prompt" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  expect(copied[0]).toContain("two eggs");
  fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: `\`\`\`json\n${importedMealJson(null)}\n\`\`\`` } });
  fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("items[0].amount");
  expect(screen.getByRole("button", { name: "Confirm meal" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: importedMealJson() } });
  fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
  expect(await screen.findByRole("heading", { name: "Preview" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm meal" }));
  await waitFor(async () => expect(await repository.get("meals", "imported-meal-1")).toMatchObject({ status: "consumed" }));
  await waitFor(() => expect(screen.getByRole("table", { name: "Daily nutrition details" })).toHaveTextContent("144 kcal"));
  expect(screen.getAllByText("Source: Built-in database")).not.toHaveLength(0);
});

test("manual food records support custom foods, planned versus consumed sections, copy, move, delete undo, and daily totals", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<HomePage repository={repository} />);
  await screen.findByRole("heading", { name: "Today" });
  fireEvent.change(screen.getByLabelText("Custom food name"), { target: { value: "Protein pudding" } });
  fireEvent.change(screen.getByLabelText("Custom calories per 100"), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText("Custom protein per 100"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save custom food" }));
  expect(await screen.findByRole("option", { name: "Protein pudding" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Food search"), { target: { value: "Protein pudding" } });
  fireEvent.change(screen.getByLabelText("Food"), { target: { value: "custom-protein-pudding" } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "150" } });
  fireEvent.change(screen.getByLabelText("Meal type"), { target: { value: "lunch" } });
  fireEvent.change(screen.getByLabelText("Record status"), { target: { value: "planned" } });
  fireEvent.click(screen.getByRole("button", { name: "Add food to day" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Copy Protein pudding" })).toBeInTheDocument());
  expect(screen.getByText("Planned calories").parentElement).toHaveTextContent("180");
  fireEvent.click(screen.getByRole("button", { name: "Copy Protein pudding" }));
  expect(await screen.findAllByText("Protein pudding")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Move Protein pudding" })[0]);
  fireEvent.change(screen.getByLabelText("Move copied meal to"), { target: { value: "dinner" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete Protein pudding" })[0]);
  expect(await screen.findByRole("button", { name: "Undo delete" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo delete" }));
  expect(await screen.findAllByText("Protein pudding")).toHaveLength(2);
});

test("onboarding rejects invalid numeric values and profiles below age 18", async () => {
  render(<HomePage repository={createTestRepository()} />);
  await screen.findByRole("heading", { name: "设置你的目标" });

  fireEvent.change(screen.getByLabelText("年龄"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请填写有效的年龄、身高和体重后再计算。");

  fillValidProfile();
  fireEvent.change(screen.getByLabelText("年龄"), { target: { value: "17" } });
  fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("仅支持18周岁及以上成年人设置自动目标。");
  expect(screen.queryByText("预计每日热量")).not.toBeInTheDocument();
});

test("onboarding blocks confirmation when the estimated target requires manual review", async () => {
  render(<HomePage repository={createTestRepository()} />);
  await screen.findByRole("heading", { name: "设置你的目标" });

  fillValidProfile();
  fireEvent.change(screen.getByLabelText("日常活动水平"), { target: { value: "1.2" } });
  fireEvent.change(screen.getByLabelText("目标节奏"), { target: { value: "0.25" } });
  fireEvent.click(screen.getByRole("button", { name: "计算目标" }));

  expect(await screen.findByText("该目标低于估算静息能量，无法自动确认。请降低减脂速度或调整资料后重新计算。")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("均衡饮食"));
  expect(screen.getByRole("button", { name: "确认并开始记录" })).toBeDisabled();
});

test("app waits for persisted onboarding state before choosing the dashboard or onboarding", async () => {
  const repository = createTestRepository();
  await repository.put("profile", { id: "current", sex: "male", age: 31, heightCm: 180, weightKg: 82 });
  await repository.put("settings", { id: "onboarding", planId: "balanced" });
  await repository.put("targets", {
    id: "current",
    calculationDate: today(),
    sourceProfile: { sex: "male", age: 31, heightCm: 180, weightKg: 82 },
    target: { bmrKcal: 1800, tdeeKcal: 2200, targetCaloriesKcal: 1870, deficitRatio: 0.15, warnings: [], requiresManualReview: false },
    macroTargets: { proteinG: 131.2, fatG: 65.6, carbohydrateG: 187.8 },
    planId: "balanced",
  });

  render(<HomePage repository={repository} />);

  expect(screen.getByRole("status")).toHaveTextContent("正在恢复你的数据…");
  expect(screen.queryByRole("heading", { name: "设置你的目标" })).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
});

test("plans can be copied, customized, and saved with external source metadata", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<HomePage repository={repository} />);
  await screen.findByRole("heading", { name: "Plans and templates" });

  fireEvent.change(screen.getByLabelText("Plan preset"), { target: { value: "lower-carbohydrate" } });
  expect(screen.getByRole("heading", { name: "Plan preview" })).toBeInTheDocument();
  expect(screen.getByText("Calories: 1500 kcal")).toBeInTheDocument();
  expect(screen.getByText("Protein: 108 g (29%)")).toBeInTheDocument();
  expect(screen.getByText("Protein formula: 1.8 g/kg")).toBeInTheDocument();
  expect(screen.getByText(`Calculation date: ${today()}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Use selected plan" }));
  await waitFor(async () => {
    expect(await repository.get("settings", "onboarding")).toMatchObject({ planId: "lower-carbohydrate" });
    expect(await repository.get("targets", "current")).toMatchObject({ planId: "lower-carbohydrate", calculationDate: today(), macroTargets: { proteinG: 108, fatG: 60, carbohydrateG: 132 } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy selected plan" }));
  expect(await screen.findByDisplayValue(/copy$/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Coach plan" } });
  fireEvent.change(screen.getByLabelText("Protein g/kg"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Fat g/kg"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Save custom plan" }));
  expect(await screen.findAllByText("Coach plan")).not.toHaveLength(0);

  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Dietitian reference" } });
  fireEvent.change(screen.getByLabelText("External source name"), { target: { value: "Nutrition Clinic" } });
  fireEvent.change(screen.getByLabelText("External source URL"), { target: { value: "https://clinic.example/plan" } });
  fireEvent.change(screen.getByLabelText("External source date"), { target: { value: today() } });
  fireEvent.click(screen.getByRole("button", { name: "Save external plan" }));
  expect(await screen.findAllByText("Source: Nutrition Clinic")).not.toHaveLength(0);
  expect(screen.getByText("External reference")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Reference link" })).not.toHaveLength(0);
  expect(screen.getAllByRole("link", { name: "Reference link" })[0]).toHaveAttribute("href", "https://clinic.example/plan");
  expect(await repository.list("plans")).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Coach plan", sourceType: "custom", proteinGPerKg: 2, fatGPerKg: 0.9 }),
    expect.objectContaining({ name: "Dietitian reference", sourceType: "external", sourceName: "Nutrition Clinic", sourceUrl: "https://clinic.example/plan" }),
  ]));

  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Unverified reference" } });
  fireEvent.change(screen.getByLabelText("External source URL"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save external plan" }));
  expect(await screen.findAllByText("来源未验证")).not.toHaveLength(0);
  expect(await repository.list("plans")).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Unverified reference", sourceType: "external", sourceName: "Nutrition Clinic", sourceDate: today(), sourceUrl: undefined }),
  ]));

  fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Invalid URL reference" } });
  fireEvent.change(screen.getByLabelText("External source URL"), { target: { value: "ftp://clinic.example/plan" } });
  fireEvent.click(screen.getByRole("button", { name: "Save external plan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("absolute http:// or https:// source URL");
  expect(await repository.list("plans")).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Invalid URL reference" })]));
});

test("meal and day templates apply cloned planned records without mutating their source", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  await repository.put("meals", {
    id: "breakfast-source", date: today(), mealType: "breakfast", status: "consumed",
    foodItems: [{ id: "egg-source", name: "Egg", caloriesKcal: 144, nutrition: { proteinG: 13, carbohydrateG: 3, fatG: 9 }, dataSource: { type: "user_manual", name: "Kitchen scale", confidence: 1, isEstimated: false } }],
  });
  await repository.put("meals", {
    id: "lunch-source", date: today(), mealType: "lunch", status: "consumed",
    foodItems: [{ id: "rice-source", name: "Rice", caloriesKcal: 180, nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: { type: "user_manual", name: "Kitchen scale", confidence: 1, isEstimated: false } }],
  });
  render(<HomePage repository={repository} />);
  await screen.findByRole("heading", { name: "Plans and templates" });

  fireEvent.change(screen.getByLabelText("Template meal type"), { target: { value: "lunch" } });
  fireEvent.click(screen.getByRole("button", { name: "Save lunch as meal template" }));
  fireEvent.click(screen.getByRole("button", { name: "Save day as template" }));
  expect(await screen.findByText("Lunch template")).toBeInTheDocument();
  expect(await screen.findByText("Day template")).toBeInTheDocument();
  expect(screen.getAllByText("324 kcal")).not.toHaveLength(0);
  expect(screen.getAllByText(/Protein: 17 g/)).not.toHaveLength(0);
  expect(screen.getAllByText(/Dietary planning is informational/)).not.toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Apply Lunch template" }));
  await waitFor(async () => expect((await repository.list("meals")).filter((record) => record.status === "planned")).toHaveLength(1));
  const mealTemplate = (await repository.list<any>("templates")).find((template) => template.name === "Lunch template")!;
  const planned = (await repository.list<any>("meals")).find((record) => record.status === "planned");
  expect(planned).toMatchObject({ date: today(), mealType: "lunch", status: "planned", foodItems: [{ name: "Rice" }] });
  expect(planned.id).not.toBe(mealTemplate.records[0].id);
  expect(planned.foodItems[0].id).not.toBe(mealTemplate.records[0].foodItems[0].id);
  fireEvent.click(screen.getAllByRole("button", { name: "Edit Rice" }).at(-1)!);
  fireEvent.change(screen.getByLabelText("Edit food name"), { target: { value: "Edited rice" } });
  fireEvent.click(screen.getByRole("button", { name: "Save food edit" }));
  await waitFor(async () => expect(await repository.get("meals", planned.id)).toMatchObject({ foodItems: [{ name: "Edited rice" }] }));
  expect((await repository.list<any>("templates")).find((template) => template.name === "Lunch template")!.records[0].foodItems[0]).toMatchObject({ name: "Rice", nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: { name: "Kitchen scale", confidence: 1 } });

  fireEvent.click(screen.getByRole("button", { name: "Apply Day template" }));
  await waitFor(async () => expect((await repository.list("meals")).filter((record) => record.status === "planned")).toHaveLength(3));
});

test("plan selection uses the local date at a UTC boundary", () => {
  const boundary = { getFullYear: () => 2026, getMonth: () => 6, getDate: () => 23, toISOString: () => "2026-07-22T16:30:00.000Z" } as unknown as Date;
  expect(currentCalculationDate(boundary)).toBe("2026-07-23");
  expect(currentCalculationDate(boundary)).toBe(localDateKey(boundary));
  expect(currentCalculationDate(boundary)).not.toBe(boundary.toISOString().slice(0, 10));
});

test("template application deep-clones nested nutrition and source metadata", () => {
  const source = { id: "template-meal", date: today(), mealType: "lunch" as const, status: "consumed" as const, foodItems: [{ id: "template-item", name: "Rice", caloriesKcal: 180, nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: { type: "user_manual" as const, name: "Kitchen scale", confidence: 1, isEstimated: false } }] };
  const [applied] = cloneTemplateRecords([source], today(), (prefix) => `${prefix}-new`);
  expect(applied).not.toBe(source);
  expect(applied.foodItems[0]).not.toBe(source.foodItems[0]);
  expect(applied.foodItems[0].nutrition).not.toBe(source.foodItems[0].nutrition);
  expect(applied.foodItems[0].dataSource).not.toBe(source.foodItems[0].dataSource);
  expect(applied).toMatchObject({ id: "meal-new", date: today(), status: "planned", foodItems: [{ id: "item-new", nutrition: source.foodItems[0].nutrition, dataSource: source.foodItems[0].dataSource }] });
});

test("responsive shell exposes the specified desktop and mobile navigation", () => {
  render(
    <AppShell>
      <h1>内容</h1>
    </AppShell>,
  );

  expect(screen.getByLabelText("桌面导航")).toHaveTextContent("今日记录趋势计划数据设置");
  expect(screen.getByLabelText("移动导航")).toHaveTextContent("今日记录趋势计划我的");
});
