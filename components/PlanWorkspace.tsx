"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import { applyPlan } from "@/domain/energy";
import { macroEnergy } from "@/domain/nutrition";
import type { MealRecord, MealTemplate, MealType, PlanDefinition } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const DISCLAIMER = "Dietary planning is informational and should be adjusted with a qualified professional when needed.";
const UNVERIFIED_SOURCE = "\u6765\u6e90\u672a\u9a8c\u8bc1";
const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
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

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function PlanWorkspace({ records, date }: Readonly<{ records: MealRecord[]; date: string }>) {
  const { profile, plans, selectedPlan, target, savePlan, selectPlan, templates, saveTemplate, applyTemplate } = useAppStore();
  const allPlans = useMemo(() => [...BUILT_IN_PLANS, ...plans], [plans]);
  const [planId, setPlanId] = useState(selectedPlan?.id ?? BUILT_IN_PLANS[0].id);
  const [planName, setPlanName] = useState("");
  const [proteinPerKg, setProteinPerKg] = useState("1.6");
  const [fatPerKg, setFatPerKg] = useState("0.8");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState(date);
  const [templateMealType, setTemplateMealType] = useState<MealType>("breakfast");
  const [error, setError] = useState("");
  const selected = allPlans.find((plan) => plan.id === planId) ?? BUILT_IN_PLANS[0];
  const previewMacros = target && profile ? applyPlan(target.target.targetCaloriesKcal, profile.weightKg, selected) : null;
  const previewEnergy = previewMacros ? macroEnergy(previewMacros) : null;
  const previewPercent = (kcal: number) => previewEnergy?.totalMacroKcal ? Math.round(kcal / previewEnergy.totalMacroKcal * 100) : 0;

  function copyPlan() {
    setPlanName(`${selected.name} copy`);
    setProteinPerKg(String(selected.proteinGPerKg));
    setFatPerKg(String(selected.fatGPerKg));
    setSourceName("");
    setSourceUrl("");
    setError("");
  }

  async function save(kind: "custom" | "external") {
    const protein = Number(proteinPerKg);
    const fat = Number(fatPerKg);
    if (!planName.trim() || !Number.isFinite(protein) || protein <= 0 || !Number.isFinite(fat) || fat <= 0 || (kind === "external" && (!sourceName.trim() || !sourceDate))) {
      setError("Enter a plan name, positive formula inputs, and an external source name and date when applicable.");
      return;
    }
    if (kind === "external" && sourceUrl.trim() && !isAbsoluteHttpUrl(sourceUrl.trim())) {
      setError("Enter an absolute http:// or https:// source URL, or leave it blank to mark it unverified.");
      return;
    }
    const plan: PlanDefinition = {
      id: makeId("plan"), name: planName.trim(), description: `${kind === "external" ? "External reference" : "Custom plan"}. ${DISCLAIMER}`,
      proteinGPerKg: protein, fatGPerKg: fat, sourceType: kind,
      sourceName: kind === "external" ? sourceName.trim() : undefined,
      sourceUrl: kind === "external" && sourceUrl.trim() ? sourceUrl.trim() : undefined,
      sourceDate: kind === "external" ? sourceDate : undefined,
      isEstimated: true, requiresUserConfirmation: true,
    };
    await savePlan(plan);
    setPlanId(plan.id);
    setError("");
  }

  async function saveMealTemplate() {
    const mealRecords = records.filter((record) => record.mealType === templateMealType);
    if (mealRecords.length === 0) {
      setError(`Add a ${templateMealType} record before saving its template.`);
      return;
    }
    const template: MealTemplate = { id: makeId("template"), name: `${templateMealType[0].toUpperCase()}${templateMealType.slice(1)} template`, kind: "meal", records: cloneRecords(mealRecords), createdOn: date };
    await saveTemplate(template);
    setError("");
  }

  async function saveDayTemplate() {
    if (records.length === 0) {
      setError("Add a record before saving a day template.");
      return;
    }
    const template: MealTemplate = { id: makeId("template"), name: "Day template", kind: "day", records: cloneRecords(records), createdOn: date };
    await saveTemplate(template);
    setError("");
  }

  return <section className="plan-workspace" id="plans" aria-labelledby="plans-heading">
    <p className="eyebrow">Plans</p><h2 id="plans-heading">Plans and templates</h2>
    <div className="record-grid">
      <section className="workspace-card">
        <h3>Calorie plan</h3>
        <label>Plan preset<select aria-label="Plan preset" value={planId} onChange={(event) => setPlanId(event.target.value)}>{allPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <section className="plan-preview" aria-labelledby="plan-preview-heading">
          <h4 id="plan-preview-heading">Plan preview</h4>
          <p>Source type: {selected.sourceType}</p><p>Source: {selected.sourceType === "system" ? "System preset" : selected.sourceName ?? "User"}</p>
          <p>Calculation date: {date}</p><p>Protein formula: {selected.proteinGPerKg} g/kg</p><p>Fat formula: {selected.fatGPerKg} g/kg</p>
          {selected.sourceType === "external" && <div><p>Source date: {selected.sourceDate}</p>{selected.sourceUrl ? <a href={selected.sourceUrl}>Reference link</a> : <p>{UNVERIFIED_SOURCE}</p>}</div>}
          {target && previewMacros && previewEnergy && <div><p>Calories: {round(target.target.targetCaloriesKcal)} kcal</p><p>Protein: {round(previewMacros.proteinG)} g ({previewPercent(previewEnergy.proteinKcal)}%)</p><p>Carbohydrate: {round(previewMacros.carbohydrateG)} g ({previewPercent(previewEnergy.carbohydrateKcal)}%)</p><p>Fat: {round(previewMacros.fatG)} g ({previewPercent(previewEnergy.fatKcal)}%)</p></div>}
          <p>{DISCLAIMER}</p>
        </section>
        <button type="button" onClick={() => void selectPlan(selected)}>Use selected plan</button><button type="button" onClick={copyPlan}>Copy selected plan</button>
        <label>Plan name<input aria-label="Plan name" value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
        <label>Protein g/kg<input aria-label="Protein g/kg" type="number" min="0" step="0.1" value={proteinPerKg} onChange={(event) => setProteinPerKg(event.target.value)} /></label>
        <label>Fat g/kg<input aria-label="Fat g/kg" type="number" min="0" step="0.1" value={fatPerKg} onChange={(event) => setFatPerKg(event.target.value)} /></label>
        <button type="button" onClick={() => void save("custom")}>Save custom plan</button>
        <h4>External reference metadata</h4>
        <label>External source name<input aria-label="External source name" value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label>
        <label>External source URL<input aria-label="External source URL" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
        <label>External source date<input aria-label="External source date" type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} /></label>
        <button type="button" onClick={() => void save("external")}>Save external plan</button>{error && <p role="alert" className="form-error">{error}</p>}
      </section>
      <section className="workspace-card">
        <h3>Templates</h3><p>Save current records as reusable meal or day templates. Applying a template always creates planned records for {date}.</p>
        <label>Template meal type<select aria-label="Template meal type" value={templateMealType} onChange={(event) => setTemplateMealType(event.target.value as MealType)}>{mealTypes.map((mealType) => <option key={mealType} value={mealType}>{mealType}</option>)}</select></label>
        <button type="button" onClick={() => void saveMealTemplate()}>Save {templateMealType} as meal template</button><button type="button" onClick={() => void saveDayTemplate()}>Save day as template</button>
        {templates.length === 0 ? <p>No templates yet</p> : templates.map((template) => <TemplateCard key={template.id} template={template} onApply={() => void applyTemplate(template.id, date)} />)}
      </section>
    </div>
    <section className="record-lists" aria-label="Saved plan details">
      {plans.map((plan) => <article className="meal-list" key={plan.id}><h3>{plan.name}</h3><p>{plan.sourceType === "external" ? "External reference" : "Custom plan"}</p><p>Source type: {plan.sourceType}</p><p>Source: {plan.sourceName ?? "User"}</p>{plan.sourceDate && <p>Source date: {plan.sourceDate}</p>}{plan.sourceUrl ? <a href={plan.sourceUrl}>Reference link</a> : plan.sourceType === "external" ? <p>{UNVERIFIED_SOURCE}</p> : null}<p>{plan.description}</p><p>{DISCLAIMER}</p></article>)}
    </section>
    <p className="estimate-copy">{DISCLAIMER}</p>
  </section>;
}

function TemplateCard({ template, onApply }: Readonly<{ template: MealTemplate; onApply: () => void }>) {
  const totals = templateTotals(template.records);
  const energy = macroEnergy(totals);
  const percent = (kcal: number) => energy.totalMacroKcal ? Math.round(kcal / energy.totalMacroKcal * 100) : 0;
  return <article className="meal-list"><h4>{template.name}</h4><p>{template.kind === "day" ? "Day template" : "Meal template"} · saved {template.createdOn}</p><p>{round(totals.caloriesKcal)} kcal</p><p>Protein: {round(totals.proteinG)} g ({percent(energy.proteinKcal)}%)</p><p>Carbohydrate: {round(totals.carbohydrateG)} g ({percent(energy.carbohydrateKcal)}%)</p><p>Fat: {round(totals.fatG)} g ({percent(energy.fatKcal)}%)</p><button type="button" onClick={onApply}>Apply {template.name}</button></article>;
}
