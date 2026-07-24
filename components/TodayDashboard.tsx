"use client";

import { macroEnergy, mealShares, sumConsumed } from "@/domain/nutrition";
import type { MealRecord, TargetSnapshot } from "@/domain/types";
import { localDateKey } from "@/domain/local-date";

const mealLabels = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
const round = (value: number) => Math.round(value);

function plannedCalories(records: MealRecord[]) {
  return records.filter((record) => record.status === "planned").flatMap((record) => record.foodItems).reduce((total, item) => total + item.caloriesKcal, 0);
}

export default function TodayDashboard({ records, target, date = localDateKey(new Date()) }: Readonly<{ records: MealRecord[]; target: TargetSnapshot; date?: string }>) {
  const todayRecords = records.filter((record) => record.date === date);
  const consumed = sumConsumed(todayRecords);
  const targetCalories = target.target.targetCaloriesKcal;
  const difference = targetCalories - consumed.caloriesKcal;
  const energy = macroEnergy(consumed);
  const shares = mealShares(todayRecords);
  const macroRows = [
    { name: "蛋白质", grams: consumed.proteinG, target: target.macroTargets.proteinG, energy: energy.proteinKcal },
    { name: "碳水化合物", grams: consumed.carbohydrateG, target: target.macroTargets.carbohydrateG, energy: energy.carbohydrateKcal },
    { name: "脂肪", grams: consumed.fatG, target: target.macroTargets.fatG, energy: energy.fatKcal },
  ];
  const recordSources = [...new Map(todayRecords.flatMap((record) => record.foodItems).map((item) => [item.dataSource?.name ?? "手动录入", item.dataSource?.name ?? "手动录入"])).values()];

  return <section className="today-dashboard" id="today" aria-labelledby="today-heading">
    <p className="eyebrow">{date === localDateKey(new Date()) ? "今日" : "历史"}</p><h1 id="today-heading">今日</h1><p>{date}</p>
    <div className="dashboard-cards">
      <article className="metric-card"><span>实际热量</span><strong>{round(consumed.caloriesKcal)} 千卡</strong></article>
      <article className="metric-card"><span>目标热量</span><strong>{round(targetCalories)} 千卡</strong></article>
      <article className="metric-card"><span>{difference >= 0 ? "剩余" : "超出"}</span><strong>{round(Math.abs(difference))} 千卡</strong></article>
      <article className="metric-card"><span>计划热量</span><strong>{round(plannedCalories(todayRecords))} 千卡</strong></article>
    </div>
    <section className="dashboard-section"><h2>三大营养素目标与 4/4/9 热量占比</h2>{macroRows.map((macro) => { const share = energy.totalMacroKcal ? macro.energy / energy.totalMacroKcal : 0; const completion = macro.target > 0 ? macro.grams / macro.target : 0; return <div className="bar-row" key={macro.name}><span>{macro.name}：{round(macro.grams)} g · 目标 {round(macro.target)} g · 完成 {round(completion * 100)}% · 热量占比 {round(share * 100)}%</span><div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, completion * 100)}%` }} /></div></div>; })}</section>
    <section className="dashboard-section"><h2>三餐加餐热量占比</h2>{Object.entries(shares).map(([meal, share]) => <div className="bar-row" key={meal}><span>{mealLabels[meal as keyof typeof mealLabels]}：{round(share * 100)}%</span><div className="bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div></div>)}</section>
    <section className="dashboard-section"><h2>数据来源</h2>{recordSources.length ? recordSources.map((source) => <span className="source-badge" key={source}>来源：{source}</span>) : <p>暂无数据来源</p>}</section>
    <table aria-label="每日营养详情"><caption>每日可视化数据的文字等价表</caption><thead><tr><th>指标</th><th>实际</th><th>目标</th><th>完成度 / 4-4-9 热量占比</th></tr></thead><tbody>
      <tr><th>热量</th><td>{round(consumed.caloriesKcal)} 千卡</td><td>{round(targetCalories)} 千卡</td><td>{round(targetCalories > 0 ? consumed.caloriesKcal / targetCalories * 100 : 0)}%</td></tr>
      {macroRows.map((macro) => <tr key={macro.name}><th>{macro.name}</th><td>{round(macro.grams)} g</td><td>{round(macro.target)} g</td><td>完成 {round(macro.target > 0 ? macro.grams / macro.target * 100 : 0)}%；热量占比 {round(energy.totalMacroKcal ? macro.energy / energy.totalMacroKcal * 100 : 0)}%</td></tr>)}
      {Object.entries(shares).map(([meal, share]) => <tr key={meal}><th>{mealLabels[meal as keyof typeof mealLabels]}</th><td>{round(share * consumed.caloriesKcal)} 千卡</td><td>—</td><td>{round(share * 100)}%</td></tr>)}
    </tbody></table>
  </section>;
}
