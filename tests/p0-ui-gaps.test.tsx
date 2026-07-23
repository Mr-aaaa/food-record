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
    fireEvent.click(screen.getByLabelText("I confirm I am 18 or older"));
    fireEvent.click(screen.getByLabelText("I confirm I am not in an excluded population"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await screen.findByRole("heading", { name: "Today" });
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
    await screen.findByRole("button", { name: "Edit Rice" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Rice" }));
    fireEvent.change(screen.getByLabelText("Edit amount"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Edit calories"), { target: { value: "174" } });
    fireEvent.change(screen.getByLabelText("Edit protein"), { target: { value: "3.9" } });
    fireEvent.change(screen.getByLabelText("Edit carbohydrate"), { target: { value: "38.9" } });
    fireEvent.change(screen.getByLabelText("Edit fat"), { target: { value: "0.45" } });
    fireEvent.change(screen.getByLabelText("Edit status"), { target: { value: "consumed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save food edit" }));

    await waitFor(async () => expect(await repo.get("meals", "planned")).toMatchObject({
      status: "consumed",
      foodItems: [{ amount: 150, caloriesKcal: 174, nutrition: { proteinG: 3.9, carbohydrateG: 38.9, fatG: .45 } }],
    }));
    expect(screen.getByText("Actual calories").parentElement).toHaveTextContent("174 kcal");
    const protein = within(screen.getByRole("table", { name: "Daily nutrition details" })).getByRole("row", { name: /Protein/ });
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
    await screen.findByRole("heading", { name: "Today" });
    fireEvent.change(screen.getByLabelText("Natural language meal"), { target: { value: "one bowl oats" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate portable prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy full prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy schema only" }));

    const draft = {
      schemaVersion: "1.0", recordId: "ai-meal", date: today(), mealType: "breakfast", status: "planned",
      rawText: "one bowl oats", warnings: ["amount uncertain"],
      createdAt: `${today()}T08:00:00+08:00`, updatedAt: `${today()}T08:00:00+08:00`,
      items: [{ itemId: "oats", foodId: "oats", name: "Oats", amount: null, unit: "g", isAmbiguous: true,
        nutrition: { caloriesKcal: 380, proteinG: 13, carbohydrateG: 68, fatG: 7 },
        dataSource: { type: "ai_estimated", name: "External AI", confidence: .4, isEstimated: true } }],
    };
    const exactJson = JSON.stringify(draft);
    fireEvent.change(screen.getByLabelText("Paste meal JSON"), { target: { value: exactJson } });
    fireEvent.click(screen.getByRole("button", { name: "Validate JSON" }));
    expect(await screen.findByRole("button", { name: "Confirm meal" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy correction prompt" }));
    fireEvent.change(screen.getByLabelText("Imported amount 1"), { target: { value: "80" } });
    fireEvent.click(screen.getByLabelText("Imported ambiguity 1"));
    fireEvent.change(screen.getByLabelText("Imported source confidence 1"), { target: { value: "0.8" } });
    expect(screen.getByRole("button", { name: "Confirm meal" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm meal" }));

    await waitFor(async () => expect(await repo.get<any>("meals", "ai-meal")).toMatchObject({
      audit: {
        originalJson: exactJson,
        rawText: "one bowl oats",
        schemaVersion: "1.0",
        warnings: ["amount uncertain"],
        source: "external_ai",
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "View traceability for Oats" }));
    expect(within(screen.getByRole("region", { name: "Traceability for Oats" })).getByText("one bowl oats")).toBeInTheDocument();
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
    await screen.findByRole("heading", { name: "Today" });
    fireEvent.change(screen.getByLabelText("Browse date"), { target: { value: "2026-07-01" } });
    await screen.findByText("Historical meal");
    expect(screen.getByText("Actual calories").parentElement).toHaveTextContent("500 kcal");
  });
});
