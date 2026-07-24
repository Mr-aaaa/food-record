import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import HomePage from "@/app/page";
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
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "Today" });

    fireEvent.change(screen.getByLabelText("Profile weight (kg)"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(screen.getByText("Profile saved.")).toBeInTheDocument());

    const stored = await repo.get("profile", "current");
    expect(stored).toMatchObject({ weightKg: 75 });

    fireEvent.change(screen.getByLabelText("Profile deficit"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Recalculate from profile" }));
    await waitFor(() => expect(screen.getByText("Daily target recalculated and saved.")).toBeInTheDocument());

    const targets = await repo.list("targets");
    const todayTarget = targets.find((t) => t.id === today());
    expect(todayTarget).toBeTruthy();
    expect(todayTarget!.calculation?.manuallyEdited).toBe(true);
  });

  test("manually saves target overrides", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "Today" });

    fireEvent.change(screen.getByLabelText("Target daily calories (kcal)"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText("Target protein (g)"), { target: { value: "140" } });
    fireEvent.click(screen.getByRole("button", { name: "Save manual target" }));

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
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "Today" });

    fireEvent.change(screen.getByLabelText("Template meal type"), { target: { value: "breakfast" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "My breakfast" } });
    fireEvent.change(screen.getByLabelText("Template tags"), { target: { value: "high-protein, quick" } });
    fireEvent.change(screen.getByLabelText("Template notes"), { target: { value: "Post-workout meal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save breakfast as meal template" }));

    await waitFor(() => expect(screen.getByText("My breakfast")).toBeInTheDocument());
    expect(screen.getByText("Tags: high-protein, quick")).toBeInTheDocument();
    expect(screen.getByText("Notes: Post-workout meal")).toBeInTheDocument();
    expect(screen.getByText("Default meal: breakfast")).toBeInTheDocument();
  });
});

describe("plan audit metadata", () => {
  test("external plan displays calculation rule, inputs, applicability, and entered date", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "Today" });

    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Blogger plan" } });
    fireEvent.change(screen.getByLabelText("Protein g/kg"), { target: { value: "2.0" } });
    fireEvent.change(screen.getByLabelText("Fat g/kg"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("External source name"), { target: { value: "Fitness blog" } });
    fireEvent.change(screen.getByLabelText("Plan applicability"), { target: { value: "Active adults 18-50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save external plan" }));

    await waitFor(() => expect(screen.getAllByText("Blogger plan").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Calculation rule:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inputs: protein 2 g\/kg, fat 0.7 g\/kg/).length).toBeGreaterThan(0);
    expect(screen.getByText("Applicability: Active adults 18-50")).toBeInTheDocument();
  });
});

describe("trends visual", () => {
  test("shows an accessible weight trend bar when metrics exist", async () => {
    const repo = createRepo();
    await seedAndOnboard(repo);
    await repo.put("bodyMetrics", { id: "m1", measuredAt: `${today()}T08:00:00`, weightKg: 79.5, waistCm: 88, fasting: true });
    render(<HomePage repository={repo} />);
    await screen.findByRole("heading", { name: "Today" });

    const visual = screen.getByRole("heading", { name: "Weight trend (calendar-day 7-day average)" });
    expect(visual).toBeInTheDocument();
    expect(visual.parentElement!.textContent).toContain("79.5");
  });
});
