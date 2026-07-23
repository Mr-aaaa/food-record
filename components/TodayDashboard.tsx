"use client";

import { macroEnergy, mealShares, sumConsumed } from "@/domain/nutrition";
import type { MealRecord, TargetSnapshot } from "@/domain/types";
import { localDateKey } from "@/domain/local-date";

const mealLabels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const round = (value: number) => Math.round(value);

function plannedCalories(records: MealRecord[]) {
  return records.filter((record) => record.status === "planned").flatMap((record) => record.foodItems).reduce((total, item) => total + item.caloriesKcal, 0);
}

export default function TodayDashboard({ records, target }: Readonly<{ records: MealRecord[]; target: TargetSnapshot }>) {
  const todayRecords = records.filter((record) => record.date === localDateKey(new Date()));
  const consumed = sumConsumed(todayRecords);
  const targetCalories = target.target.targetCaloriesKcal;
  const difference = targetCalories - consumed.caloriesKcal;
  const energy = macroEnergy(consumed);
  const shares = mealShares(todayRecords);
  const macroRows = [
    { name: "Protein", grams: consumed.proteinG, energy: energy.proteinKcal },
    { name: "Carbohydrate", grams: consumed.carbohydrateG, energy: energy.carbohydrateKcal },
    { name: "Fat", grams: consumed.fatG, energy: energy.fatKcal },
  ];
  const recordSources = [...new Map(todayRecords.flatMap((record) => record.foodItems).map((item) => [item.dataSource?.name ?? "Manual entry", item.dataSource?.name ?? "Manual entry"])).values()];

  return <section className="today-dashboard" id="today" aria-labelledby="today-heading">
    <p className="eyebrow">Today</p><h1 id="today-heading">Today</h1><h2 className="today-chinese-heading">今日</h2>
    <div className="dashboard-cards">
      <article className="metric-card"><span>Actual calories</span><strong>{round(consumed.caloriesKcal)} kcal</strong></article>
      <article className="metric-card"><span>Target calories</span><strong>{round(targetCalories)} kcal</strong></article>
      <article className="metric-card"><span>{difference >= 0 ? "Remaining" : "Exceeded"}</span><strong>{round(Math.abs(difference))} kcal</strong></article>
      <article className="metric-card"><span>Planned calories</span><strong>{round(plannedCalories(todayRecords))} kcal</strong></article>
    </div>
    <section className="dashboard-section"><h2>Macro energy share</h2>{macroRows.map((macro) => { const share = energy.totalMacroKcal ? macro.energy / energy.totalMacroKcal : 0; return <div className="bar-row" key={macro.name}><span>{macro.name}: {round(macro.grams)} g · {round(share * 100)}%</span><div className="bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div></div>; })}</section>
    <section className="dashboard-section"><h2>Meal shares</h2>{Object.entries(shares).map(([meal, share]) => <div className="bar-row" key={meal}><span>{mealLabels[meal as keyof typeof mealLabels]}: {round(share * 100)}%</span><div className="bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div></div>)}</section>
    <section className="dashboard-section"><h2>Data sources</h2>{recordSources.length ? recordSources.map((source) => <span className="source-badge" key={source}>Source: {source}</span>) : <p>No sources yet</p>}</section>
    <table aria-label="Daily nutrition details"><caption>Text equivalent of the daily visual bars</caption><thead><tr><th>Measure</th><th>Actual</th><th>Target or share</th></tr></thead><tbody>
      <tr><th>Calories</th><td>{round(consumed.caloriesKcal)} kcal</td><td>{round(targetCalories)} kcal</td></tr>
      {macroRows.map((macro) => <tr key={macro.name}><th>{macro.name}</th><td>{round(macro.grams)} g</td><td>{round(energy.totalMacroKcal ? macro.energy / energy.totalMacroKcal * 100 : 0)}%</td></tr>)}
      {Object.entries(shares).map(([meal, share]) => <tr key={meal}><th>{mealLabels[meal as keyof typeof mealLabels]}</th><td>{round(share * consumed.caloriesKcal)} kcal</td><td>{round(share * 100)}%</td></tr>)}
    </tbody></table>
  </section>;
}
