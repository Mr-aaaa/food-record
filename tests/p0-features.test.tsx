import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import App from "@/src/App";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { localDateKey } from "@/domain/local-date";

let sequence = 0;
const today = () => localDateKey(new Date());

function createRepo() {
  sequence += 1;
  return createIndexedDbRepository(`p0-features-${sequence}`);
}

async function seedAndOnboard(repo: ReturnType<typeof createRepo>) {
  const profile = { sex: "male" as const, age: 30, heightCm: 175, weightKg: 80, goalWeightKg: 70, activityFactor: 1.375 };
  await repo.put("profile", { id: "current", ...profile });
  await repo.put("settings", { id: "onboarding", planId: "balanced" });
  await repo.put("targets", {
    id: today(), calculationDate: today(), sourceProfile: profile,
    target: { bmrKcal: 1780, tdeeKcal: 2447, targetCaloriesKcal: 2080, deficitRatio: 0.15, warnings: [], requiresManualReview: false },
    macroTargets: { proteinG: 128, carbohydrateG: 260, fatG: 69 }, planId: "balanced",
  });
}

describe("settings workspace", () => {
  test("edits profile and recalculates daily target", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    render(<App repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("设置"));

    fireEvent.change(screen.getByLabelText("体重（公斤）"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(screen.getByText("资料已保存。")).toBeInTheDocument());

    const stored = await repo.get("profile", "current");
    expect(stored).toMatchObject({ weightKg: 75 });

    fireEvent.change(screen.getByLabelText("减脂节奏"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "根据资料重新计算" }));
    await waitFor(() => expect(screen.getByText("每日目标已重新计算并保存。")).toBeInTheDocument());

    const targets = await repo.list("targets");
    const todayTarget = targets.find((t) => t.id === today());
    expect(todayTarget).toBeTruthy();
    expect(todayTarget!.calculation?.manuallyEdited).toBe(true);
  });

  test("manually saves target overrides", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    render(<App repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("设置"));

    fireEvent.change(screen.getByLabelText("目标每日热量（千卡）"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText("目标蛋白质（g）"), { target: { value: "140" } });
    fireEvent.click(screen.getByRole("button", { name: "保存手动目标" }));

    await waitFor(async () => {
      const target = await repo.get("targets", today());
      expect(target).toMatchObject({ target: { targetCaloriesKcal: 1800 }, macroTargets: { proteinG: 140 } });
    });
  });
});

describe("template metadata", () => {
  test("saves template with custom name, tags, and notes then displays them", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    await repo.put("meals", {
      id: "tpl-meal", date: today(), mealType: "breakfast", status: "consumed",
      foodItems: [{ id: "eggs", name: "Eggs", caloriesKcal: 140, nutrition: { proteinG: 12, carbohydrateG: 1, fatG: 10 } }],
    });
    render(<App repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));

    fireEvent.change(screen.getByLabelText("模板餐次"), { target: { value: "breakfast" } });
    fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "My breakfast" } });
    fireEvent.change(screen.getByLabelText("模板标签"), { target: { value: "high-protein, quick" } });
    fireEvent.change(screen.getByLabelText("模板备注"), { target: { value: "Post-workout meal" } });
    fireEvent.click(screen.getByRole("button", { name: "将 早餐 保存为餐次模板" }));

    await waitFor(() => expect(screen.getByText("My breakfast")).toBeInTheDocument());
    expect(screen.getByText("标签：high-protein、quick")).toBeInTheDocument();
    expect(screen.getByText("备注：Post-workout meal")).toBeInTheDocument();
    expect(screen.getByText("默认餐次：早餐")).toBeInTheDocument();
  });
});

describe("plan audit metadata", () => {
  test("external plan displays calculation rule, inputs, applicability, and entered date", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    render(<App repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("计划"));

    fireEvent.change(screen.getByLabelText("计划名称"), { target: { value: "Blogger plan" } });
    fireEvent.change(screen.getByLabelText("蛋白质 g/kg"), { target: { value: "2.0" } });
    fireEvent.change(screen.getByLabelText("脂肪 g/kg"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("外部来源名称"), { target: { value: "Fitness blog" } });
    fireEvent.change(screen.getByLabelText("计划适用人群"), { target: { value: "Active adults 18-50" } });
    fireEvent.click(screen.getByRole("button", { name: "保存外部参考计划" }));

    await waitFor(() => expect(screen.getAllByText("Blogger plan").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/计算规则：/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/参数：蛋白质 2 g\/kg，脂肪 0.7 g\/kg/).length).toBeGreaterThan(0);
    expect(screen.getByText("适用人群：Active adults 18-50")).toBeInTheDocument();
  });
});

describe("trends visual", () => {
  test("shows an accessible weight trend bar when metrics exist", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    await repo.put("bodyMetrics", { id: "m1", measuredAt: `${today()}T08:00:00`, weightKg: 79.5, waistCm: 88, fasting: true });
    render(<App repository={repo} />);
    await screen.findByRole("heading", { name: "今日" });
    fireEvent.click(within(screen.getByLabelText("桌面导航")).getByText("趋势"));

    const visual = screen.getByRole("heading", { name: "体重趋势（自然日 7 日均值）" });
    expect(visual).toBeInTheDocument();
    expect(visual.parentElement!.textContent).toContain("79.5");
  });
});
