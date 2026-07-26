import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { localDateKey } from "@/domain/local-date";
import { cloneTemplateRecords, currentCalculationDate } from "@/state/app-store";
import AppShell from "@/components/AppShell";
import DataWorkspace from "@/components/DataWorkspace";
import App from "@/src/App";
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

function confirmSafety() {
  fireEvent.click(screen.getByLabelText("我确认已年满 18 周岁"));
  fireEvent.click(screen.getByLabelText("我确认不属于特殊人群（孕期、哺乳期、饮食障碍风险等）"));
}

test("onboarding calculates an estimated target and persists only after confirmation", async () => {
  const repository = createTestRepository();
  render(<App repository={repository} />);

  expect(await screen.findByRole("heading", { name: "设置你的目标" })).toBeInTheDocument();
  const onboardingMain = screen.getByRole("main");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(within(onboardingMain).getByRole("heading", { name: "设置你的目标" })).toBeInTheDocument();
  expect(within(onboardingMain).getByRole("heading", { name: "恢复已有备份" })).toBeInTheDocument();
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
  confirmSafety();
  fireEvent.click(screen.getByRole("button", { name: "确认并开始记录" }));

  expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();

  await waitFor(async () => {
    expect(await repository.list("profile")).toHaveLength(1);
    expect(await repository.list("settings")).toHaveLength(1);
    expect(await repository.list("targets")).toHaveLength(1);
  });

  expect(await repository.get("settings", "onboarding")).toMatchObject({ planId: "balanced" });
  expect(await repository.get("targets", today())).toMatchObject({
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
  const view = render(<App repository={repository} clipboard={clipboard} downloadBackup={downloadBackup} />);
    await screen.findByRole("heading", { name: "设置你的目标" });
    fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
    expect(await screen.findByRole("alert")).toHaveFocus();
    fillValidProfile();
    fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
    fireEvent.click(await screen.findByLabelText("均衡饮食"));
    confirmSafety();
    fireEvent.click(screen.getByRole("button", { name: "确认并开始记录" }));
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));

    fireEvent.change(screen.getByLabelText("自然语言餐饮描述"), { target: { value: "two eggs for breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "生成便携提示词" }));
    expect((screen.getByLabelText("生成的提示词") as HTMLTextAreaElement).value).toContain("two eggs for breakfast");
    fireEvent.click(screen.getByRole("button", { name: "复制完整提示词" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("two eggs for breakfast")));

    fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: importedMealJson() } });
    fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认导入" }));
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("今日"));
    await waitFor(() => expect(screen.getByText("实际热量").parentElement).toHaveTextContent("144 千卡"));
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));

    fireEvent.change(screen.getByLabelText("搜索食物"), { target: { value: "米饭" } });
    fireEvent.change(screen.getByLabelText("食物"), { target: { value: "rice-cooked" } });
    fireEvent.change(screen.getByLabelText("份量"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("餐次"), { target: { value: "lunch" } });
    fireEvent.change(screen.getByLabelText("记录状态"), { target: { value: "planned" } });
    fireEvent.click(screen.getByRole("button", { name: "添加到当日" }));
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("今日"));
    await waitFor(() => expect(screen.getByText("计划热量").parentElement).toHaveTextContent("116 千卡"));
    expect(screen.getByText("实际热量").parentElement).toHaveTextContent("144 千卡");
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));

    fireEvent.change(screen.getByLabelText("模板餐次"), { target: { value: "breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "将 早餐 保存为餐次模板" }));
    fireEvent.click(await screen.findByRole("button", { name: "应用 早餐模板" }));
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("今日"));
    await waitFor(() => expect(screen.getByText("计划热量").parentElement).toHaveTextContent("260 千卡"));
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("趋势"));

    fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "79.5" } });
    fireEvent.change(screen.getByLabelText("腰围（厘米）"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "保存身体指标" }));
    await waitFor(() => expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("79.5"));
    expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("88.0");
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("数据"));

    fireEvent.click(screen.getByRole("button", { name: "下载完整备份" }));
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
    render(<App repository={restoredRepository} />);
    await screen.findByRole("heading", { name: "恢复已有备份" });
    fireEvent.change(screen.getByLabelText("备份文件"), {
      target: { files: [new File([downloaded.text], downloaded.fileName, { type: downloaded.mediaType })] },
    });
    await screen.findByText(/条记录可从/);
    fireEvent.click(screen.getByRole("button", { name: "恢复备份" }));

    expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
    expect(screen.getByText("实际热量").parentElement).toHaveTextContent("144 千卡");
    expect(screen.getByText("计划热量").parentElement).toHaveTextContent("260 千卡");
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("趋势"));
    expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("79.5");
    expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("88.0");
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));
    expect(screen.getByRole("button", { name: "应用 早餐模板" })).toBeInTheDocument();
});

test("data workspace exports with a privacy warning and validates an import before showing merge impact", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  const downloaded: string[] = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { downloaded.push(this.download); };
  try {
    render(<DataWorkspace repository={repository} appVersion="0.1.0" onRestored={async () => {}} />);
    expect(screen.getByText(/备份文件包含你的个人营养和身体数据/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载完整备份" }));
    await waitFor(() => expect(downloaded[0]).toMatch(/nutrition-backup.*\.json/));

    const input = screen.getByLabelText("备份文件");
    fireEvent.change(input, { target: { files: [new File(["not json"], "broken.json", { type: "application/json" })] } });
    const errorSummary = await screen.findByRole("alert");
    expect(errorSummary).toHaveTextContent(/备份文件不是有效的 JSON/);
    expect(errorSummary).toHaveFocus();
    expect(screen.queryByText(/条记录可从/)).not.toBeInTheDocument();
    expect(await repository.get("profile", "current")).toMatchObject({ age: 30, weightKg: 60 });

    const backup = await exportAll(repository, "0.1.0");
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
    expect(await screen.findByText(/条记录可从/)).toBeInTheDocument();
    expect(screen.getByLabelText("与现有数据合并")).toBeChecked();
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
  const input = screen.getByLabelText("备份文件");
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
  await screen.findByText(/条记录可从/);
  fireEvent.click(screen.getByLabelText("替换所有本地数据"));
  expect(screen.getByRole("button", { name: "恢复备份" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("我确认此操作将永久替换本地数据"));
  expect(screen.getByRole("button", { name: "恢复备份" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "恢复备份" }));
  await waitFor(async () => expect(await repository.get("profile", "current")).toMatchObject({ age: 41, weightKg: 63 }));
});

test("fresh install exposes restore controls and enters the app after restoring an existing backup", async () => {
  const source = createTestRepository();
  await seedOnboardedUser(source);
  const backup = await exportAll(source, "0.1.0");
  const fresh = createTestRepository();
  render(<App repository={fresh} />);

  expect(await screen.findByRole("heading", { name: "恢复已有备份" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("备份文件"), { target: { files: [new File([JSON.stringify(backup)], "backup.json", { type: "application/json" })] } });
  await screen.findByText(/条记录可从/);
  fireEvent.click(screen.getByRole("button", { name: "恢复备份" }));
  expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
  expect(await fresh.get("settings", "onboarding")).toMatchObject({ planId: "balanced" });
});

test("portable prompt can be copied, validates pasted fenced JSON, previews and confirms only complete entries", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  const copied: string[] = [];
  render(<App repository={repository} clipboard={{ writeText: async (text: string) => { copied.push(text); } }} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.change(screen.getByLabelText("自然语言餐饮描述"), { target: { value: "two eggs" } });
  fireEvent.click(screen.getByRole("button", { name: "生成便携提示词" }));
  fireEvent.click(screen.getByRole("button", { name: "复制完整提示词" }));
  expect(copied[0]).toContain("two eggs");
  fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: `\`\`\`json\n${importedMealJson(null)}\n\`\`\`` } });
  fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("items[0].amount");
  expect(screen.getByRole("button", { name: "确认导入" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: importedMealJson() } });
  fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
  expect(await screen.findByRole("heading", { name: "预览与编辑" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await waitFor(async () => expect(await repository.get("meals", "imported-meal-1")).toMatchObject({ status: "consumed" }));
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("今日"));
  await waitFor(() => expect(screen.getByRole("table", { name: "每日营养详情" })).toHaveTextContent("144 千卡"));
});

test("manual food records support custom foods, planned versus consumed sections, copy, move, delete undo, and daily totals", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.change(screen.getByLabelText("自定义食物名称"), { target: { value: "Protein pudding" } });
  fireEvent.change(screen.getByLabelText("每 100 克热量"), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText("每 100 克蛋白质"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "保存自定义食物" }));
  expect(await screen.findByRole("option", { name: "Protein pudding" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("搜索食物"), { target: { value: "Protein pudding" } });
  fireEvent.change(screen.getByLabelText("食物"), { target: { value: "custom-protein-pudding" } });
  fireEvent.change(screen.getByLabelText("份量"), { target: { value: "150" } });
  fireEvent.change(screen.getByLabelText("餐次"), { target: { value: "lunch" } });
  fireEvent.change(screen.getByLabelText("记录状态"), { target: { value: "planned" } });
  fireEvent.click(screen.getByRole("button", { name: "添加到当日" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "复制 Protein pudding" })).toBeInTheDocument());
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("今日"));
  expect(screen.getByText("计划热量").parentElement).toHaveTextContent("180");
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.click(screen.getByRole("button", { name: "复制 Protein pudding" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "复制 Protein pudding" })).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("button", { name: "移动 Protein pudding" })[0]);
  fireEvent.change(screen.getByLabelText("移动到的餐次"), { target: { value: "dinner" } });
  fireEvent.click(screen.getByRole("button", { name: "确认移动" }));
  fireEvent.click(screen.getAllByRole("button", { name: "删除 Protein pudding" })[0]);
  expect(await screen.findByRole("button", { name: "撤销删除" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "复制 Protein pudding" })).toHaveLength(2));
});

test("onboarding rejects invalid numeric values and profiles below age 18", async () => {
  render(<App repository={createTestRepository()} />);
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
  render(<App repository={createTestRepository()} />);
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

  render(<App repository={repository} />);

  expect(screen.getByRole("status")).toHaveTextContent("正在恢复你的数据…");
  expect(screen.queryByRole("heading", { name: "设置你的目标" })).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "今日" })).toBeInTheDocument();
});

test("body metrics can be saved, edited, deleted, and shown with seven-day averages", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<App repository={repository} />);

  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("趋势"));
  expect(await screen.findByRole("heading", { name: "身体指标与趋势" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("腰围（厘米）"), { target: { value: "82" } });
  fireEvent.change(screen.getByLabelText("测量时间"), { target: { value: "2026-07-01T07:30" } });
  fireEvent.click(screen.getByLabelText("空腹测量"));
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "After waking" } });
  fireEvent.click(screen.getByRole("button", { name: "保存身体指标" }));

  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([
    expect.objectContaining({ weightKg: 70, waistCm: 82, measuredAt: "2026-07-01T07:30", fasting: true, notes: "After waking" }),
  ]));
  expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("70.0");
  expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent("82.0");
  expect(screen.getByRole("table", { name: "身体指标趋势数据" })).toHaveTextContent(/7 日均值/);

  fireEvent.click(screen.getByRole("button", { name: "编辑身体指标 2026-07-01T07:30" }));
  fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "69" } });
  fireEvent.click(screen.getByRole("button", { name: "保存身体指标" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([
    expect.objectContaining({ weightKg: 69, waistCm: 82 }),
  ]));

  fireEvent.click(screen.getByRole("button", { name: "删除身体指标 2026-07-01T07:30" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toEqual([]));
});

test("body metric trend table averages multiple dated weight and waist measurements", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<App repository={repository} />);

  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("趋势"));
  await screen.findByRole("heading", { name: "身体指标与趋势" });
  fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("腰围（厘米）"), { target: { value: "82" } });
  fireEvent.change(screen.getByLabelText("测量时间"), { target: { value: "2026-07-01T07:30" } });
  fireEvent.click(screen.getByRole("button", { name: "保存身体指标" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toHaveLength(1));

  fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "68" } });
  fireEvent.change(screen.getByLabelText("腰围（厘米）"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText("测量时间"), { target: { value: "2026-07-03T07:30" } });
  fireEvent.click(screen.getByRole("button", { name: "保存身体指标" }));
  await waitFor(async () => expect(await repository.list("bodyMetrics")).toHaveLength(2));

  const trendTable = screen.getByRole("table", { name: "身体指标趋势数据" });
  const julyThird = within(trendTable).getAllByRole("row").find((row) => within(row).queryByRole("rowheader", { name: "2026-07-03" }));
  expect(julyThird).toBeDefined();
  expect(within(julyThird!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["68.0", "69.0", "80.0", "81.0"]);
  expect(screen.getByRole("button", { name: "编辑身体指标 2026-07-01T07:30" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "编辑身体指标 2026-07-03T07:30" })).toBeInTheDocument();
});

test("plans can be copied, customized, and saved with external source metadata", async () => {
  const repository = createTestRepository();
  await seedOnboardedUser(repository);
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));
  await screen.findByRole("heading", { name: "计划与模板" });

  fireEvent.change(screen.getByLabelText("计划预设"), { target: { value: "lower-carbohydrate" } });
  expect(screen.getByRole("heading", { name: "计划预览" })).toBeInTheDocument();
  expect(screen.getByText("热量：1500 千卡")).toBeInTheDocument();
  expect(screen.getByText("蛋白质：108 g (29%)")).toBeInTheDocument();
  expect(screen.getByText("蛋白质公式：1.8 g/kg")).toBeInTheDocument();
  expect(screen.getByText(`计算日期：${today()}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "使用所选计划" }));
  await waitFor(async () => {
    expect(await repository.get("settings", "onboarding")).toMatchObject({ planId: "lower-carbohydrate" });
    expect(await repository.get("targets", today())).toMatchObject({ planId: "lower-carbohydrate", calculationDate: today(), macroTargets: { proteinG: 108, fatG: 60, carbohydrateG: 132 } });
  });
  fireEvent.click(screen.getByRole("button", { name: "复制当前计划" }));
  expect(await screen.findByDisplayValue(/副本$/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("计划名称"), { target: { value: "Coach plan" } });
  fireEvent.change(screen.getByLabelText("蛋白质 g/kg"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("脂肪 g/kg"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "保存自定义计划" }));
  expect(await screen.findAllByText("Coach plan")).not.toHaveLength(0);

  fireEvent.change(screen.getByLabelText("计划名称"), { target: { value: "Dietitian reference" } });
  fireEvent.change(screen.getByLabelText("外部来源名称"), { target: { value: "Nutrition Clinic" } });
  fireEvent.change(screen.getByLabelText("外部来源链接"), { target: { value: "https://clinic.example/plan" } });
  fireEvent.change(screen.getByLabelText("外部来源日期"), { target: { value: today() } });
  fireEvent.click(screen.getByRole("button", { name: "保存外部参考计划" }));
  expect(await screen.findAllByText("来源：Nutrition Clinic")).not.toHaveLength(0);
  expect(screen.getByText("外部参考计划")).toBeInTheDocument();
  const referenceLinks = screen.getAllByRole("link", { name: "参考链接" });
  expect(referenceLinks).toHaveLength(2);
  referenceLinks.forEach((link) => {
    expect(link).toHaveAttribute("href", "https://clinic.example/plan");
    expect(link).toHaveClass("reference-link");
  });
  expect(await repository.list("plans")).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Coach plan", sourceType: "custom", proteinGPerKg: 2, fatGPerKg: 0.9 }),
    expect.objectContaining({ name: "Dietitian reference", sourceType: "external", sourceName: "Nutrition Clinic", sourceUrl: "https://clinic.example/plan" }),
  ]));

  fireEvent.change(screen.getByLabelText("计划名称"), { target: { value: "Unverified reference" } });
  fireEvent.change(screen.getByLabelText("外部来源链接"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存外部参考计划" }));
  expect(await screen.findAllByText("来源未验证")).not.toHaveLength(0);
  expect(await repository.list("plans")).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Unverified reference", sourceType: "external", sourceName: "Nutrition Clinic", sourceDate: today(), sourceUrl: undefined }),
  ]));

  fireEvent.change(screen.getByLabelText("计划名称"), { target: { value: "Invalid URL reference" } });
  fireEvent.change(screen.getByLabelText("外部来源链接"), { target: { value: "ftp://clinic.example/plan" } });
  fireEvent.click(screen.getByRole("button", { name: "保存外部参考计划" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/请输入以 http/);
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
  render(<App repository={repository} />);
  await screen.findByRole("heading", { name: "今日" });
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));
  await screen.findByRole("heading", { name: "计划与模板" });

  fireEvent.change(screen.getByLabelText("模板餐次"), { target: { value: "lunch" } });
  fireEvent.click(screen.getByRole("button", { name: "将 午餐 保存为餐次模板" }));
  fireEvent.click(screen.getByRole("button", { name: "将全天保存为模板" }));
  expect(await screen.findByText("午餐模板")).toBeInTheDocument();
  expect(await screen.findByText("全天模板")).toBeInTheDocument();
  expect(screen.getAllByText("324 千卡")).not.toHaveLength(0);
  expect(screen.getAllByText(/蛋白质：17 g/)).not.toHaveLength(0);
  expect(screen.getAllByText(/饮食计划仅供参考/)).not.toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "应用 午餐模板" }));
  await waitFor(async () => expect((await repository.list("meals")).filter((record) => record.status === "planned")).toHaveLength(1));
  const mealTemplate = (await repository.list<any>("templates")).find((template) => template.name === "午餐模板")!;
  const planned = (await repository.list<any>("meals")).find((record) => record.status === "planned");
  expect(planned).toMatchObject({ date: today(), mealType: "lunch", status: "planned", foodItems: [{ name: "Rice" }] });
  expect(planned.id).not.toBe(mealTemplate.records[0].id);
  expect(planned.foodItems[0].id).not.toBe(mealTemplate.records[0].foodItems[0].id);
  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("记录"));
  fireEvent.click(screen.getAllByRole("button", { name: "编辑 Rice" }).at(-1)!);
  fireEvent.change(screen.getByLabelText("编辑食物名称"), { target: { value: "Edited rice" } });
  fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));
  await waitFor(async () => expect(await repository.get("meals", planned.id)).toMatchObject({ foodItems: [{ name: "Edited rice" }] }));
  expect((await repository.list<any>("templates")).find((template) => template.name === "午餐模板")!.records[0].foodItems[0]).toMatchObject({ name: "Rice", nutrition: { proteinG: 4, carbohydrateG: 40, fatG: 1 }, dataSource: { name: "Kitchen scale", confidence: 1 } });

  fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));
  fireEvent.click(screen.getByRole("button", { name: "应用 全天模板" }));
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
    <AppShell currentView="today" onNavigate={() => {}}>
      <h1>内容</h1>
    </AppShell>,
  );

  expect(screen.getByLabelText("桌面导航")).toHaveTextContent("今日记录趋势计划数据设置");
  expect(screen.getByLabelText("移动导航")).toHaveTextContent("今日记录趋势计划我的");
});
