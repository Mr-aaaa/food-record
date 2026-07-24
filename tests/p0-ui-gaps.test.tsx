import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import HomePage from "@/app/page";
import { localDateKey } from "@/domain/local-date";
import { createIndexedDbRepository } from "@/storage/indexed-db";

let sequence = 0;
const today = () => localDateKey(new Date());
const repository = () => createIndexedDbRepository(`p0-ui-gaps-${++sequence}`);

async function seed(repo: ReturnType<typeof repository>, meals: object[] = []) {
  const profile = { sex: "female", age: 30, heightCm: 165, weightKg: 60, goalWeightKg: 55, activityFactor: 1.375 };
  await repo.put("profile", { id: "current", ...profile });
  await repo.put("settings", { id: "onboarding", planId: "balanced" });
  await repo.put("targets", {
    id: today(), calculationDate: today(), sourceProfile: profile,
    target: { bmrKcal: 1300, tdeeKcal: 1787.5, targetCaloriesKcal: 1500, deficitRatio: .16, warnings: [], requiresManualReview: false },
    macroTargets: { proteinG: 100, carbohydrateG: 150, fatG: 50 }, planId: "balanced",
  });
  for (const meal of meals) await repo.put("meals", meal);
}

describe("P0 safety and profile audit", () => {
  test("requires adult and excluded-population confirmations and persists activity factor", async () => {
    const repo = repository();
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "设置你的目标" });
    fireEvent.change(screen.getByLabelText("年龄"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("身高（厘米）"), { target: { value: "165" } });
    fireEvent.change(screen.getByLabelText("体重（千克）"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "计算目标" }));
    fireEvent.click(await screen.findByLabelText("均衡饮食"));

    const confirm = screen.getByRole("button", { name: "确认并开始记录" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("我确认已年满 18 周岁"));
    fireEvent.click(screen.getByLabelText("我确认不属于特殊人群（孕期、哺乳期、饮食障碍风险等）"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await screen.findByRole("heading", { name: "今日" });
    expect(await repo.get("profile", "current")).toMatchObject({ age: 30, activityFactor: 1.2 });
    expect((await repo.list("targets")).some((item) => item.id === today())).toBe(true);
  });
});

describe("planned meal lifecycle", () => {
  test("edits nutrition and explicitly marks a planned meal consumed", async () => {
    const repo = repository();
    await seed(repo, [{
      id: "planned", date: today(), mealType: "lunch", status: "planned",
      foodItems: [{ id: "rice", name: "Rice", amount: 100, unit: "g", caloriesKcal: 116, nutrition: { proteinG: 2.6, carbohydrateG: 25.9, fatG: .3 } }],
    }]);
    render(<HomePage repository={repo} />);
    await screen.findByRole("button", { name: "编辑 Rice" });
    fireEvent.click(screen.getByRole("button", { name: "编辑 Rice" }));
    fireEvent.change(screen.getByLabelText("编辑份量"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("编辑热量"), { target: { value: "174" } });
    fireEvent.change(screen.getByLabelText("编辑蛋白质"), { target: { value: "3.9" } });
    fireEvent.change(screen.getByLabelText("编辑碳水化合物"), { target: { value: "38.9" } });
    fireEvent.change(screen.getByLabelText("编辑脂肪"), { target: { value: "0.45" } });
    fireEvent.change(screen.getByLabelText("编辑状态"), { target: { value: "consumed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    await waitFor(async () => expect(await repo.get("meals", "planned")).toMatchObject({
      status: "consumed",
      foodItems: [{ amount: 150, caloriesKcal: 174, nutrition: { proteinG: 3.9, carbohydrateG: 38.9, fatG: .45 } }],
    }));
    expect(screen.getByText("实际热量").parentElement).toHaveTextContent("174 千卡");
    const protein = within(screen.getByRole("table", { name: "每日营养详情" })).getByRole("row", { name: /蛋白质/ });
    expect(protein).toHaveTextContent("4 g");
    expect(protein).toHaveTextContent("4%");
  });
});

describe("portable import correction and traceability", () => {
  test("copies three prompt variants, corrects an incomplete draft, and keeps its exact audit data", async () => {
    const repo = repository();
    await seed(repo);
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    render(<HomePage repository={repo} clipboard={clipboard} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.change(screen.getByLabelText("自然语言餐饮描述"), { target: { value: "one bowl oats" } });
    fireEvent.click(screen.getByRole("button", { name: "生成便携提示词" }));
    fireEvent.click(screen.getByRole("button", { name: "复制完整提示词" }));
    fireEvent.click(screen.getByRole("button", { name: "仅复制数据格式" }));

    const draft = {
      schemaVersion: "1.0", recordId: "ai-meal", date: today(), mealType: "breakfast", status: "planned",
      rawText: "one bowl oats", warnings: ["amount uncertain"],
      createdAt: `${today()}T08:00:00+08:00`, updatedAt: `${today()}T08:00:00+08:00`,
      items: [{ itemId: "oats", foodId: "oats", name: "Oats", amount: null, unit: "g", isAmbiguous: true,
        nutrition: { caloriesKcal: 380, proteinG: 13, carbohydrateG: 68, fatG: 7 },
        dataSource: { type: "ai_estimated", name: "External AI", confidence: .4, isEstimated: true } }],
    };
    const exactJson = JSON.stringify(draft);
    fireEvent.change(screen.getByLabelText("粘贴餐饮 JSON"), { target: { value: exactJson } });
    fireEvent.click(screen.getByRole("button", { name: "验证 JSON" }));
    expect(await screen.findByRole("button", { name: "确认导入" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "复制修正提示词" }));
    fireEvent.change(screen.getByLabelText("导入份量 1"), { target: { value: "80" } });
    fireEvent.click(screen.getByLabelText("导入身份不明确 1"));
    fireEvent.change(screen.getByLabelText("导入来源置信度 1"), { target: { value: "0.8" } });
    expect(screen.getByRole("button", { name: "确认导入" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

    await waitFor(async () => expect(await repo.get<any>("meals", "ai-meal")).toMatchObject({
      audit: {
        originalJson: exactJson,
        rawText: "one bowl oats",
        schemaVersion: "1.0",
        warnings: ["amount uncertain"],
        source: "external_ai",
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "查看 Oats 溯源" }));
    expect(within(screen.getByRole("region", { name: "溯源 Oats" })).getByText("one bowl oats")).toBeInTheDocument();
    expect(clipboard.writeText).toHaveBeenCalledTimes(3);
  });
});

describe("date navigation", () => {
  test("browses a historical local date without mixing today's data", async () => {
    const repo = repository();
    await seed(repo, [{
      id: "history", date: "2026-07-01", mealType: "dinner", status: "consumed",
      foodItems: [{ id: "historical-food", name: "Historical meal", caloriesKcal: 500, nutrition: { proteinG: 20, carbohydrateG: 50, fatG: 20 } }],
    }]);
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.change(screen.getByLabelText("选择日期"), { target: { value: "2026-07-01" } });
    await screen.findByText("Historical meal");
    expect(screen.getByText("实际热量").parentElement).toHaveTextContent("500 千卡");
  });
});
