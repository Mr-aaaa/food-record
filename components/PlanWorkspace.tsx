"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import { applyPlan } from "@/domain/energy";
import { macroEnergy } from "@/domain/nutrition";
import type { MealRecord, MealTemplate, MealType, PlanDefinition } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const DISCLAIMER = "饮食计划仅供参考，如有需要请在专业人士指导下调整。"
const UNVERIFIED_SOURCE = "\u6765\u6e90\u672a\u9a8c\u8bc1";
const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const mealTypeLabels: Record<MealType, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function activityTierLabel(activityFactor: number | undefined): string {
  if (activityFactor === undefined) return "未知";
  if (activityFactor <= 1.375) return "每周 2-3 小时";
  if (activityFactor <= 1.55) return "每周 4-5 小时";
  if (activityFactor <= 1.725) return "每周 6-7 小时";
  return "每周 8-9 小时";
}

function templateTotals(records: MealRecord[]) {
  return records.flatMap((record) => record.foodItems).reduce((total, item) => ({
    caloriesKcal: total.caloriesKcal + item.caloriesKcal,
    proteinG: total.proteinG + item.nutrition.proteinG,
    carbohydrateG: total.carbohydrateG + item.nutrition.carbohydrateG,
    fatG: total.fatG + item.nutrition.fatG,
  }), { caloriesKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 });
}

function cloneRecords(records: MealRecord[]) {
  return records.map((record) => ({ ...record, foodItems: record.foodItems.map((item) => ({ ...item, nutrition: { ...item.nutrition }, dataSource: item.dataSource ? { ...item.dataSource } : undefined })) }));
}


export default function PlanWorkspace({ records, date }: Readonly<{ records: MealRecord[]; date: string }>) {
  const { profile, plans, selectedPlan, target, savePlan, selectPlan, templates, saveTemplate, applyTemplate } = useAppStore();
  const allPlans = useMemo(() => [...BUILT_IN_PLANS, ...plans], [plans]);
  const [planId, setPlanId] = useState(selectedPlan?.id ?? BUILT_IN_PLANS[0].id);
  const [planName, setPlanName] = useState("");
  const [proteinPerKg, setProteinPerKg] = useState("1.6");
  const [fatPerKg, setFatPerKg] = useState("0.8");
  const [carbohydratePerKg, setCarbohydratePerKg] = useState("");
  const [templateMealType, setTemplateMealType] = useState<MealType>("breakfast");
  const [templateName, setTemplateName] = useState("");
  const [templateTags, setTemplateTags] = useState("");
  const [templateNotes, setTemplateNotes] = useState("");
  const [error, setError] = useState("");
  const selected = allPlans.find((plan) => plan.id === planId) ?? BUILT_IN_PLANS[0];
  const previewMacros = target && profile ? applyPlan(target.target.targetCaloriesKcal, profile.weightKg, selected) : null;
  const previewEnergy = previewMacros ? macroEnergy(previewMacros) : null;
  const previewPercent = (kcal: number) => previewEnergy?.totalMacroKcal ? Math.round(kcal / previewEnergy.totalMacroKcal * 100) : 0;

  function copyPlan() {
    setPlanName(`${selected.name} 副本`);
    setProteinPerKg(String(selected.proteinGPerKg));
    setFatPerKg(String(selected.fatGPerKg));
    setCarbohydratePerKg(typeof selected.calculationInputs?.carbohydrateGPerKg === "number" ? String(selected.calculationInputs.carbohydrateGPerKg) : "");
    setError("");
  }

  async function save() {
    const protein = Number(proteinPerKg);
    const fat = Number(fatPerKg);
    const carbs = carbohydratePerKg.trim() === "" ? undefined : Number(carbohydratePerKg);
    if (!planName.trim() || !Number.isFinite(protein) || protein <= 0 || !Number.isFinite(fat) || fat <= 0 || (carbs !== undefined && (!Number.isFinite(carbs) || carbs < 0))) {
      setError("请输入计划名称和有效的蛋白质、脂肪 g/kg（碳水可选）。");
      return;
    }
    const plan: PlanDefinition = {
      id: makeId("plan"), name: planName.trim(), description: `自定义计划. ${DISCLAIMER}`,
      proteinGPerKg: protein, fatGPerKg: fat, sourceType: "custom",
      isEstimated: true, requiresUserConfirmation: true,
      calculationRule: carbs !== undefined ? "蛋白质/脂肪/碳水均按 g/kg" : "蛋白质 g/kg 和脂肪 g/kg；碳水化合物填充剩余热量",
      calculationInputs: { proteinGPerKg: protein, fatGPerKg: fat, carbohydrateGPerKg: carbs ?? 0, bodyWeightKg: profile?.weightKg ?? 0 },
    };
    await savePlan(plan);
    setPlanId(plan.id);
    setError("");
  }

  async function saveMealTemplate() {
    const mealRecords = records.filter((record) => record.mealType === templateMealType);
    if (mealRecords.length === 0) {
      setError(`保存${mealTypeLabels[templateMealType]}模板前请先添加该餐次记录。`);
      return;
    }
    const template: MealTemplate = { id: makeId("template"), name: templateName.trim() || `${mealTypeLabels[templateMealType]}模板`, kind: "meal", records: cloneRecords(mealRecords), createdOn: date, tags: templateTags.trim() ? templateTags.split(",").map((t) => t.trim()).filter(Boolean) : undefined, defaultMealType: templateMealType, notes: templateNotes.trim() || undefined };
    await saveTemplate(template);
    setError("");
  }

  async function saveDayTemplate() {
    if (records.length === 0) {
      setError("保存全天模板前请先添加记录。");
      return;
    }
    const template: MealTemplate = { id: makeId("template"), name: "全天模板", kind: "day", records: cloneRecords(records), createdOn: date };
    await saveTemplate(template);
    setError("");
  }

  return <section className="plan-workspace" id="plans" aria-labelledby="plans-heading">
    <p className="eyebrow">计划</p><h2 id="plans-heading">计划与模板</h2>
    <div className="record-grid">
      <section className="workspace-card">
        <h3>热量计划</h3>
        <label>计划预设<select aria-label="计划预设" value={planId} onChange={(event) => setPlanId(event.target.value)}>{allPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <section className="plan-preview" aria-labelledby="plan-preview-heading">
          <h4 id="plan-preview-heading">计划预览</h4>
          <p className="plan-preview-source">来源：{selected.sourceType === "system" ? (selected.sourceName ?? "系统预设") : selected.sourceName ?? "用户"}{selected.sourceType === "external" ? " · 外部参考" : selected.sourceType === "custom" ? " · 自定义" : ""}</p>
          {selected.id === "tanchengyi-activity" && profile?.activityFactor && <p className="plan-preview-match">当前活动量：{activityTierLabel(profile.activityFactor)}（系数 {profile.activityFactor}）</p>}
          <p>计算日期：{date}</p><p>蛋白质公式：{selected.proteinGPerKg} g/kg</p><p>脂肪公式：{selected.fatGPerKg} g/kg</p>
          {selected.calculationInputs && typeof selected.calculationInputs.carbohydrateGPerKg === "number" && <p className="plan-preview-tier">碳水公式：{selected.calculationInputs.carbohydrateGPerKg} g/kg{selected.calculationInputs.tiers ? " · 分档：" + selected.calculationInputs.tiers : ""}</p>}
          {selected.sourceType === "external" && <div className="plan-preview-external"><p>来源日期：{selected.sourceDate}</p>{selected.sourceUrl ? <a className="reference-link" href={selected.sourceUrl}>参考链接</a> : <p>{UNVERIFIED_SOURCE}</p>}</div>}
          {target && previewMacros && previewEnergy && <div className="plan-preview-macros">
            <p>热量：{round(target.target.targetCaloriesKcal)} 千卡</p>
            <p>蛋白质：{round(previewMacros.proteinG)} g ({previewPercent(previewEnergy.proteinKcal)}%)</p>
            <p>碳水化合物：{round(previewMacros.carbohydrateG)} g ({previewPercent(previewEnergy.carbohydrateKcal)}%)</p>
            <p>脂肪：{round(previewMacros.fatG)} g ({previewPercent(previewEnergy.fatKcal)}%)</p>
          </div>}
          <p className="estimate-copy">{DISCLAIMER}</p>
        </section>
        <button type="button" onClick={() => void selectPlan(selected)}>使用所选计划</button><button type="button" onClick={copyPlan}>复制当前计划</button>
        <label>计划名称<input aria-label="计划名称" value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
        <label>蛋白质 g/kg<input aria-label="蛋白质 g/kg" type="number" min="0" step="0.1" value={proteinPerKg} onChange={(event) => setProteinPerKg(event.target.value)} /></label>
        <label>脂肪 g/kg<input aria-label="脂肪 g/kg" type="number" min="0" step="0.1" value={fatPerKg} onChange={(event) => setFatPerKg(event.target.value)} /></label>
        <label>碳水化合物 g/kg（可选，留空则按剩余热量填充）<input aria-label="碳水化合物 g/kg" type="number" min="0" step="0.1" value={carbohydratePerKg} onChange={(event) => setCarbohydratePerKg(event.target.value)} placeholder="留空自动填充" /></label>
        <button type="button" onClick={() => void save()}>保存自定义计划</button>{error && <p role="alert" className="form-error">{error}</p>}
      </section>
      <section className="workspace-card">
        <h3>模板</h3><p>将当前记录保存为可复用的餐饮或全天模板。应用模板会在 {date} 创建计划记录。</p>
        <label>模板餐次<select aria-label="模板餐次" value={templateMealType} onChange={(event) => setTemplateMealType(event.target.value as MealType)}>{mealTypes.map((mealType) => <option key={mealType} value={mealType}>{mealTypeLabels[mealType]}</option>)}</select></label>
        <label>模板名称<input aria-label="模板名称" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={`${mealTypeLabels[templateMealType]}模板`} /></label>
        <label>标签（逗号分隔）<input aria-label="模板标签" value={templateTags} onChange={(event) => setTemplateTags(event.target.value)} /></label>
        <label>模板备注<textarea aria-label="模板备注" value={templateNotes} onChange={(event) => setTemplateNotes(event.target.value)} /></label>
        <button type="button" onClick={() => void saveMealTemplate()}>将 {mealTypeLabels[templateMealType]} 保存为餐次模板</button><button type="button" onClick={() => void saveDayTemplate()}>将全天保存为模板</button>
        {templates.length === 0 ? <p>暂无模板</p> : templates.map((template) => <TemplateCard key={template.id} template={template} onApply={() => void applyTemplate(template.id, date)} />)}
      </section>
    </div>
    <section className="plan-cards" aria-label="已保存的计划详情">
      {plans.map((plan) => <article className="plan-card" data-kind={plan.sourceType} key={plan.id}>
        <div className="plan-card-head"><h3>{plan.name}</h3><span className="plan-card-tag">{plan.sourceType === "external" ? "外部参考计划" : "自定义计划"}</span></div>
        <div className="plan-card-meta">
          <span>来源：{plan.sourceName ?? "用户"}</span>
          {plan.sourceDate && <span>来源日期：{plan.sourceDate}</span>}
          {plan.enteredOn && <span>录入日期：{plan.enteredOn}</span>}
        </div>
        {plan.sourceUrl ? <a className="reference-link" href={plan.sourceUrl}>参考链接</a> : plan.sourceType === "external" ? <p className="plan-card-unverified">{UNVERIFIED_SOURCE}</p> : null}
        <p className="plan-card-desc">{plan.description}</p>
        {plan.calculationRule && <p className="plan-card-rule">计算规则：{plan.calculationRule}</p>}
        {plan.calculationInputs && <p className="plan-card-params">参数：蛋白质 {plan.calculationInputs.proteinGPerKg} g/kg，脂肪 {plan.calculationInputs.fatGPerKg} g/kg</p>}
        {plan.applicability && <p className="plan-card-applicability">适用人群：{plan.applicability}</p>}
        <p className="estimate-copy">{DISCLAIMER}</p>
      </article>)}
    </section>
    <p className="estimate-copy">{DISCLAIMER}</p>
  </section>;
}

function TemplateCard({ template, onApply }: Readonly<{ template: MealTemplate; onApply: () => void }>) {
  const totals = templateTotals(template.records);
  const energy = macroEnergy(totals);
  const percent = (kcal: number) => energy.totalMacroKcal ? Math.round(kcal / energy.totalMacroKcal * 100) : 0;
  return <article className="template-card">
    <div className="template-card-head"><h4>{template.name}</h4><span className="template-card-tag">{template.kind === "day" ? "全天模板" : "餐次模板"}</span></div>
    <div className="template-card-meta">
      <span>保存于 {template.createdOn}</span>
      {template.defaultMealType && <p>默认餐次：{mealTypeLabels[template.defaultMealType]}</p>}
    </div>
    {template.tags && template.tags.length > 0 && <p className="template-card-tags">标签：{template.tags.join("、")}</p>}
    {template.notes && <p className="template-card-notes">备注：{template.notes}</p>}
    <div className="template-card-macros">
      <p>{round(totals.caloriesKcal)} 千卡</p>
      <p>蛋白质：{round(totals.proteinG)} g ({percent(energy.proteinKcal)}%)</p>
      <p>碳水化合物：{round(totals.carbohydrateG)} g ({percent(energy.carbohydrateKcal)}%)</p>
      <p>脂肪：{round(totals.fatG)} g ({percent(energy.fatKcal)}%)</p>
    </div>
    <button type="button" onClick={onApply}>应用 {template.name}</button>
  </article>;
}
