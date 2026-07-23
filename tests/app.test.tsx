import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { localDateKey } from "@/domain/local-date";
import { cloneTemplateRecords, currentCalculationDate } from "@/state/app-store";
import AppShell from "@/components/AppShell";
import DataWorkspace from "@/components/DataWorkspace";
import HomePage from "@/app/page";
import { exportAll } from "@/storage/backup";

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
  const onboardingMain = screen.getByRole("main");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(within(onboardingMain).getByRole("heading", { name: "设置你的目标" })).toBeInTheDocument();
  expect(within(onboardingMain).getByRole("heading", { name: "Restore existing backup" })).toBeInTheDocument();
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

test("complete P0 journey", async () => {
  const repository = createTestRepository();
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  let downloaded = { fileName: "", text: "", mediaType: "" };
  const downloadBackup = vi.fn(async (payload: typeof downloaded) => { downloaded = payload; });
  const view = render(<HomePage repository={repository} clipboard={clipboard} downloadBackup={downloadBackup} />);
    await screen.findByRole("heading", { name: "设置你的目标" });
    fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
    expect(await screen.findByRole("alert")).toHaveFocus();
    fillValidProfile();
    fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
    fireEvent.click(await screen.findByLabelText("均衡饮食"));
    fireEvent.click(screen.getByRole("button", { name: "确认并开始记录" }));
    await screen.findByRole("heading", { name: "Today" });

    fireEvent.change(screen.getByLabelText("Natural language meal"), { target: { value: "two eggs for breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate portable prompt" }));
    expect((screen.getByLabelText("Generated prompt") as HTMLTextAreaElement).value).toContain("two eggs for breakfast");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("two eggs for breakfast")));

    fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: importedMealJson() } });
    fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm meal" }));
    await waitFor(() => expect(screen.getByText("Actual calories").parentElement).toHaveTextContent("144 kcal"));

    fireEvent.change(screen.getByLabelText("Food search"), { target: { value: "米饭" } });
    fireEvent.change(screen.getByLabelText("Food"), { target: { value: "rice-cooked" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Meal type"), { target: { value: "lunch" } });
    fireEvent.change(screen.getByLabelText("Record status"), { target: { value: "planned" } });
    fireEvent.click(screen.getByRole("button", { name: "Add food to day" }));
    await waitFor(() => expect(screen.getByText("Planned calories").parentElement).toHaveTextContent("116 kcal"));
    expect(screen.getByText("Actual calories").parentElement).toHaveTextContent("144 kcal");

    fireEvent.change(screen.getByLabelText("Template meal type"), { target: { value: "breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "Save breakfast as meal template" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply Breakfast template" }));
    await waitFor(() => expect(screen.getByText("Planned calories").parentElement).toHaveTextContent("260 kcal"));

    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "79.5" } });
    fireEvent.change(screen.getByLabelText("Waist (cm)"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "Save body metric" }));
    await waitFor(() => expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("79.5"));
    expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("88.0");

    fireEvent.click(screen.getByRole("button", { name: "Download full backup" }));
    await waitFor(() => expect(downloadBackup).toHaveBeenCalledTimes(1));
    expect(downloaded.fileName).toMatch(/nutrition-backup.*\.json/);
    expect(downloaded.mediaType).toBe("application/json");
    expect(downloaded.text.trim()).not.toBe("");
    const backup = JSON.parse(downloaded.text);
    expect(backup).toMatchObject({ schemaVersion: 1, appVersion: "0.1.0" });
    expect(backup.stores.meals).toHaveLength(3);
    expect(backup.stores.templates).toHaveLength(1);
    expect(backup.stores.bodyMetrics).toHaveLength(1);

    view.unmount();
    const restoredRepository = createTestRepository();
    render(<HomePage repository={restoredRepository} />);
    await screen.findByRole("heading", { name: "Restore existing backup" });
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [new File([downloaded.text], downloaded.fileName, { type: downloaded.mediaType })] },
    });
    await screen.findByText(/records ready to restore/i);
    fireEvent.click(screen.getByRole("button", { name: "Restore backup" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Actual calories").parentElement).toHaveTextContent("144 kcal");
    expect(screen.getByText("Planned calories").parentElement).toHaveTextContent("260 kcal");
    expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("79.5");
    expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("88.0");
    expect(screen.getByRole("button", { name: "Apply Breakfast template" })).toBeInTheDocument();
});

test("data workspace exports with a privacy warning and validates an import before showing merge impact", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  const downloaded: string[] = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { downloaded.push(this.download); };
  try {
    render(<DataWorkspace repository={repository} appVersion="0.1.0" onRestored={async () => {}} />);
    expect(screen.getByText(/contains your personal nutrition and body data/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /download full backup/i }));
    await waitFor(() => expect(downloaded[0]).toMatch(/nutrition-backup.*\.json/));

    const input = screen.getByLabelText(/backup file/i);
    fireEvent.change(input, { target: { files: [new File(["not json"], "broken.json", { type: "application/json" })] } });
    const errorSummary = await screen.findByRole("alert");
    expect(errorSummary).toHaveTextContent(/not valid json/i);
    expect(errorSummary).toHaveFocus();
    expect(screen.queryByText(/records ready to restore/i)).not.toBeInTheDocument();
    expect(await repository.get("profile", "current")).toMatchObject({ age: 30, weightKg: 60 });

    const backup = await exportAll(repository, "0.1.0");
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
    expect(await screen.findByText(/records ready to restore/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/merge with existing data/i)).toBeChecked();
  } finally { HTMLAnchorElement.prototype.click = click; }
});

test("data workspace requires explicit confirmation before replacement and does not mutate data after failed import", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  const source = createTestRepository();
  await seedOnboardedUser(source);
  await source.put("profile", { id: "current", sex: "female", age: 41, heightCm: 165, weightKg: 63 });
  const backup = await exportAll(source, "0.1.0");
  render(<DataWorkspace repository={repository} appVersion="0.1.0" onRestored={async () => {}} />);
  const input = screen.getByLabelText(/backup file/i);
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
  await screen.findByText(/records ready to restore/i);
  fireEvent.click(screen.getByLabelText(/replace all local data/i));
  expect(screen.getByRole("button", { name: /restore backup/i })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/i understand this permanently replaces/i));
  expect(screen.getByRole("button", { name: /restore backup/i })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /restore backup/i }));
  await waitFor(async () => expect(await repository.get("profile", "current")).toMatchObject({ age: 41, weightKg: 63 }));
});

test("fresh install exposes restore controls and enters the app after restoring an existing backup", async () => {
  const source = createTestRepository();
  await seedOnboardedUser(source);
  const backup = await exportAll(source, "0.1.0");
  const fresh = createTestRepository();
  render(<HomePage repository={fresh} />);

  expect(await screen.findByRole("heading", { name: /restore existing backup/i })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/backup file/i), { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
  await screen.findByText(/records ready to restore/i);
  fireEvent.click(screen.getByRole("button", { name: /restore backup/i }));
  expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(await fresh.get("settings", "onboarding")).toMatchObject({ planId: "balanced" });
});

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

test("body metrics can be saved, edited, deleted, and shown with seven-day averages", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<HomePage repository={repository} />);

  expect(await screen.findByRole("heading", { name: "Body metrics and trends" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("Waist (cm)"), { target: { value: "82" } });
  fireEvent.change(screen.getByLabelText("Measurement time"), { target: { value: "2026-07-01T07:30" } });
  fireEvent.click(screen.getByLabelText("Fasting measurement"));
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "After waking" } });
  fireEvent.click(screen.getByRole("button", { name: "Save body metric" }));

  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([
    expect.objectContaining({ weightKg: 70, waistCm: 82, measuredAt: "2026-07-01T07:30", fasting: true, notes: "After waking" }),
  ]));
  expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("70.0");
  expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("82.0");
  expect(screen.getByRole("table", { name: "Body metric trend data" })).toHaveTextContent("7-day average");

  fireEvent.click(screen.getByRole("button", { name: "Edit body metric 2026-07-01T07:30" }));
  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "69" } });
  fireEvent.click(screen.getByRole("button", { name: "Save body metric" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([
    expect.objectContaining({ weightKg: 69, waistCm: 82 }),
  ]));

  fireEvent.click(screen.getByRole("button", { name: "Delete body metric 2026-07-01T07:30" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([]));
});

test("body metric trend table averages multiple dated weight and waist measurements", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<HomePage repository={repository} />);

  await screen.findByRole("heading", { name: "Body metrics and trends" });
  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("Waist (cm)"), { target: { value: "82" } });
  fireEvent.change(screen.getByLabelText("Measurement time"), { target: { value: "2026-07-01T07:30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save body metric" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toHaveLength(1));

  fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "68" } });
  fireEvent.change(screen.getByLabelText("Waist (cm)"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText("Measurement time"), { target: { value: "2026-07-03T07:30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save body metric" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toHaveLength(2));

  const trendTable = screen.getByRole("table", { name: "Body metric trend data" });
  const julyThird = within(trendTable).getAllByRole("row").find((row) => within(row).queryByRole("rowheader", { name: "2026-07-03" }));
  expect(julyThird).toBeDefined();
  expect(within(julyThird!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["68.0", "69.0", "80.0", "81.0"]);
  expect(screen.getByRole("button", { name: "Edit body metric 2026-07-01T07:30" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit body metric 2026-07-03T07:30" })).toBeInTheDocument();
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
  const referenceLinks = screen.getAllByRole("link", { name: "Reference link" });
  expect(referenceLinks).toHaveLength(2);
  referenceLinks.forEach((link) => {
    expect(link).toHaveAttribute("href", "https://clinic.example/plan");
    expect(link).toHaveClass("reference-link");
  });
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
