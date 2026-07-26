"use client";

import { macroEnergy, mealShares, sumConsumed } from "@/domain/nutrition";
import type { MealRecord, TargetSnapshot, MacroNutrition, MealType } from "@/domain/types";
import { localDateKey } from "@/domain/local-date";
import PieChart from "@/components/PieChart";

const mealLabels: Record<MealType, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
const mealColors: Record<MealType, string> = { breakfast: "#1b6b6f", lunch: "#b07d1f", dinner: "#3d6b47", snack: "#b84a35" };
const macroColors = { protein: "#1b6b6f", carbohydrate: "#b07d1f", fat: "#b84a35" };
const round = (value: number) => Math.round(value);

function plannedCalories(records: MealRecord[]) {
  return records.filter((record) => record.status === "planned").flatMap((record) => record.foodItems).reduce((total, item) => total + item.caloriesKcal, 0);
}

interface MealMacroData {
  mealType: MealType;
  label: string;
  calories: number;
  macro: MacroNutrition;
  energy: ReturnType<typeof macroEnergy>;
}

interface FoodMacroData {
  name: string;
  mealLabel: string;
  calories: number;
  macro: MacroNutrition;
  energy: ReturnType<typeof macroEnergy>;
}

export default function TodayDashboard({ records, target, date = localDateKey(new Date()) }: Readonly<{ records: MealRecord[]; target: TargetSnapshot; date?: string }>) {
  const todayRecords = records.filter((record) => record.date === date);
  const consumed = sumConsumed(todayRecords);
  const targetCalories = target.target.targetCaloriesKcal;
  const difference = targetCalories - consumed.caloriesKcal;
  const energy = macroEnergy(consumed);
  const shares = mealShares(todayRecords);
  const macroRows = [
    { name: "蛋白质", grams: consumed.proteinG, target: target.macroTargets.proteinG, energy: energy.proteinKcal, color: macroColors.protein },
    { name: "碳水化合物", grams: consumed.carbohydrateG, target: target.macroTargets.carbohydrateG, energy: energy.carbohydrateKcal, color: macroColors.carbohydrate },
    { name: "脂肪", grams: consumed.fatG, target: target.macroTargets.fatG, energy: energy.fatKcal, color: macroColors.fat },
  ];

  // Per-meal macro data (only consumed)
  const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  const mealData: MealMacroData[] = mealTypes.map((mt) => {
    const mealRecords = todayRecords.filter((r) => r.mealType === mt && r.status === "consumed");
    const items = mealRecords.flatMap((r) => r.foodItems);
    const macro: MacroNutrition = items.reduce((m, f) => ({ proteinG: m.proteinG + f.nutrition.proteinG, carbohydrateG: m.carbohydrateG + f.nutrition.carbohydrateG, fatG: m.fatG + f.nutrition.fatG }), { proteinG: 0, carbohydrateG: 0, fatG: 0 });
    const calories = items.reduce((c, f) => c + f.caloriesKcal, 0);
    return { mealType: mt, label: mealLabels[mt], calories, macro, energy: macroEnergy(macro) };
  }).filter((m) => m.calories > 0);

  // Per-food macro data (only consumed)
  const foodData: FoodMacroData[] = todayRecords.filter((r) => r.status === "consumed").flatMap((r) => r.foodItems.map((f) => ({ name: f.name, mealLabel: mealLabels[r.mealType], calories: f.caloriesKcal, macro: f.nutrition, energy: macroEnergy(f.nutrition) }))).filter((f) => f.calories > 0);

  const recordSources = [...new Map(todayRecords.flatMap((record) => record.foodItems).map((item) => [item.dataSource?.name ?? "手动录入", item.dataSource?.name ?? "手动录入"])).values()];

  const macroPieSlices = macroRows.map((m) => ({ label: m.name, value: m.energy, color: m.color })).filter((s) => s.value > 0);

  return (
    <section className="today-dashboard" id="today" aria-labelledby="today-heading">
      <p className="eyebrow">{date === localDateKey(new Date()) ? "今日" : "历史"}</p>
      <h1 id="today-heading">今日</h1>
      <p className="dashboard-date">{date}</p>

      <div className="dashboard-cards">
        <article className="metric-card"><span>实际热量</span><strong>{round(consumed.caloriesKcal)} 千卡</strong></article>
        <article className="metric-card"><span>目标热量</span><strong>{round(targetCalories)} 千卡</strong></article>
        <article className="metric-card"><span>{difference >= 0 ? "剩余" : "超出"}</span><strong>{round(Math.abs(difference))} 千卡</strong></article>
        <article className="metric-card"><span>计划热量</span><strong>{round(plannedCalories(todayRecords))} 千卡</strong></article>
      </div>
      <p className="card-hint">实际热量 = 已摄入餐食合计；计划热量 = 已规划但尚未摄入的餐食合计</p>

      <section className="dashboard-section chart-section">
        <h2>三大营养素热量占比</h2>
        <p className="estimate-copy">每克蛋白质和碳水化合物各提供 4 千卡，每克脂肪提供 9 千卡，据此计算各营养素的热量贡献。</p>
        <div className="chart-with-legend">
          <PieChart slices={macroPieSlices} size={140} />
          <ul className="chart-legend">
            {macroRows.map((m) => { const share = energy.totalMacroKcal ? m.energy / energy.totalMacroKcal : 0; const completion = m.target > 0 ? m.grams / m.target : 0; return (
              <li key={m.name}>
                <span className="legend-dot" style={{ background: m.color }} />
                <span className="legend-label">{m.name}</span>
                <span className="legend-value">{round(m.grams)}g / 目标 {round(m.target)}g</span>
                <span className="legend-pct">热量占比 {round(share * 100)}%</span>
                <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, completion * 100)}%`, background: m.color }} /></div>
              </li>
            ); })}
          </ul>
        </div>
      </section>

      <section className="dashboard-section">
        <h2>各餐次热量与营养素</h2>
        <ul className="meal-bars">
          {mealData.map((m) => { const pct = consumed.caloriesKcal > 0 ? (m.calories / consumed.caloriesKcal) * 100 : 0; const total = m.energy.totalMacroKcal || 1; return (
            <li key={m.mealType}>
              <span className="meal-bar-label">{m.label}</span>
              <div className="meal-bar-stack">
                <div className="meal-bar-track"><i style={{ width: `${pct}%`, background: mealColors[m.mealType] }} /></div>
                <div className="meal-macro-mini">
                  <span><i style={{ background: macroColors.protein }} />蛋白 {round(m.macro.proteinG)}g · {round(m.energy.proteinKcal / total * 100)}%</span>
                  <span><i style={{ background: macroColors.carbohydrate }} />碳水 {round(m.macro.carbohydrateG)}g · {round(m.energy.carbohydrateKcal / total * 100)}%</span>
                  <span><i style={{ background: macroColors.fat }} />脂肪 {round(m.macro.fatG)}g · {round(m.energy.fatKcal / total * 100)}%</span>
                </div>
              </div>
              <span className="meal-bar-value">{round(m.calories)} 千卡 · {round(pct)}%</span>
            </li>
          ); })}
        </ul>
      </section>

      {foodData.length > 0 && (
        <section className="dashboard-section">
          <h2>热量来源</h2>
          <p className="card-hint">每个食物的热量贡献，色段依次为蛋白质 / 碳水 / 脂肪。</p>
          <div className="macro-source-legend">
            <span><i style={{ background: macroColors.protein }} />蛋白质</span>
            <span><i style={{ background: macroColors.carbohydrate }} />碳水化合物</span>
            <span><i style={{ background: macroColors.fat }} />脂肪</span>
          </div>
          <ul className="source-bars">
            {[...foodData].sort((a, b) => b.calories - a.calories).slice(0, 8).map((f) => { const total = f.energy.totalMacroKcal || 1; const maxCal = Math.max(...foodData.map((d) => d.calories), 1); return (
              <li className="source-bar-row" key={`${f.name}-${f.mealLabel}`}>
                <div className="source-bar-head"><span>{f.name}</span><span className="source-bar-cal">{round(f.calories)} 千卡 · {f.mealLabel}</span></div>
                <div className="source-bar-track">
                  <span className="source-bar-fill" style={{ width: `${(f.calories / maxCal) * 100}%` }}>
                    <span className="source-bar-seg" style={{ width: `${(f.energy.proteinKcal / total) * 100}%`, background: macroColors.protein }} />
                    <span className="source-bar-seg" style={{ width: `${(f.energy.carbohydrateKcal / total) * 100}%`, background: macroColors.carbohydrate }} />
                    <span className="source-bar-seg" style={{ width: `${(f.energy.fatKcal / total) * 100}%`, background: macroColors.fat }} />
                  </span>
                </div>
              </li>
            ); })}
          </ul>
        </section>
      )}<section className="dashboard-section">
        <h2>数据来源</h2>
        {recordSources.length ? recordSources.map((source) => <span className="source-badge" key={source}>来源：{source}</span>) : <p>暂无数据来源</p>}
      </section>

      <table aria-label="每日营养详情">
        <caption>每日可视化数据的文字等价表</caption>
        <thead><tr><th>指标</th><th>实际</th><th>目标</th><th>完成度 / 热量占比</th></tr></thead>
        <tbody>
          <tr><th>热量</th><td>{round(consumed.caloriesKcal)} 千卡</td><td>{round(targetCalories)} 千卡</td><td>{round(targetCalories > 0 ? consumed.caloriesKcal / targetCalories * 100 : 0)}%</td></tr>
          {macroRows.map((macro) => <tr key={macro.name}><th>{macro.name}</th><td>{round(macro.grams)} g</td><td>{round(macro.target)} g</td><td>完成 {round(macro.target > 0 ? macro.grams / macro.target * 100 : 0)}%；热量占比 {round(energy.totalMacroKcal ? macro.energy / energy.totalMacroKcal * 100 : 0)}%</td></tr>)}
          {Object.entries(shares).map(([meal, share]) => <tr key={meal}><th>{mealLabels[meal as MealType]}</th><td>{round(share * consumed.caloriesKcal)} 千卡</td><td>-</td><td>{round(share * 100)}%</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
