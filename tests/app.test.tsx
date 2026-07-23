import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import AppShell from "@/components/AppShell";
import HomePage from "@/app/page";

let databaseSequence = 0;

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
    calculationDate: "2026-07-23",
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

test("responsive shell exposes the specified desktop and mobile navigation", () => {
  render(
    <AppShell>
      <h1>内容</h1>
    </AppShell>,
  );

  expect(screen.getByLabelText("桌面导航")).toHaveTextContent("今日记录趋势计划数据设置");
  expect(screen.getByLabelText("移动导航")).toHaveTextContent("今日记录趋势计划我的");
});
