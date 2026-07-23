"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import { macroEnergy } from "@/domain/nutrition";
import type { MealRecord, MealTemplate, PlanDefinition } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const DISCLAIMER = "Dietary planning is informational and should be adjusted with a qualified professional when needed.";

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

export default function PlanWorkspace({ records, date }: Readonly<{ records: MealRecord[]; date: string }>) {
  const { plans, selectedPlan, target, savePlan, selectPlan, templates, saveTemplate, applyTemplate } = useAppStore();
  const allPlans = useMemo(() => [...BUILT_IN_PLANS, ...plans], [plans]);
  const [planId, setPlanId] = useState(selectedPlan?.id ?? BUILT_IN_PLANS[0].id);
  const [planName, setPlanName] = useState("");
  const [proteinPerKg, setProteinPerKg] = useState("1.6");
  const [fatPerKg, setFatPerKg] = useState("0.8");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState(date);
  const [error, setError] = useState("");
  const selected = allPlans.find((plan) => plan.id === planId) ?? BUILT_IN_PLANS[0];

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
    if (!planName.trim() || !Number.isFinite(protein) || protein <= 0 || !Number.isFinite(fat) || fat <= 0 || (kind === "external" && !sourceName.trim())) {
      setError("Enter a plan name, positive formula inputs, and an external source name when applicable.");
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
    const mealRecords = records.filter((record) => record.mealType === "breakfast");
    if (mealRecords.length === 0) {
      setError("Add a breakfast record before saving a breakfast template.");
      return;
    }
    const template: MealTemplate = { id: makeId("template"), name: "Breakfast template", kind: "meal", records: cloneRecords(mealRecords), createdOn: date };
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
        <p>Source: {selected.sourceType === "system" ? "System preset" : selected.sourceName ?? "Custom"}</p>
        <p>Formula: protein {selected.proteinGPerKg} g/kg · fat {selected.fatGPerKg} g/kg</p>
        {target && <p>Current target: {round(target.target.targetCaloriesKcal)} kcal · protein {round(target.macroTargets.proteinG)} g · carbohydrate {round(target.macroTargets.carbohydrateG)} g · fat {round(target.macroTargets.fatG)} g</p>}
        <button type="button" onClick={() => void selectPlan(selected)}>Use selected plan</button>
        <button type="button" onClick={copyPlan}>Copy selected plan</button>
        <label>Plan name<input aria-label="Plan name" value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
        <label>Protein g/kg<input aria-label="Protein g/kg" type="number" min="0" step="0.1" value={proteinPerKg} onChange={(event) => setProteinPerKg(event.target.value)} /></label>
        <label>Fat g/kg<input aria-label="Fat g/kg" type="number" min="0" step="0.1" value={fatPerKg} onChange={(event) => setFatPerKg(event.target.value)} /></label>
        <button type="button" onClick={() => void save("custom")}>Save custom plan</button>
        <h4>External reference metadata</h4>
        <label>External source name<input aria-label="External source name" value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label>
        <label>External source URL<input aria-label="External source URL" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
        <label>External source date<input aria-label="External source date" type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} /></label>
        <button type="button" onClick={() => void save("external")}>Save external plan</button>
        {error && <p role="alert" className="form-error">{error}</p>}
      </section>
      <section className="workspace-card">
        <h3>Templates</h3>
        <p>Save current records as reusable meal or day templates. Applying a template always creates planned records for {date}.</p>
        <button type="button" onClick={() => void saveMealTemplate()}>Save breakfast as meal template</button>
        <button type="button" onClick={() => void saveDayTemplate()}>Save day as template</button>
        {templates.length === 0 ? <p>No templates yet</p> : templates.map((template) => <TemplateCard key={template.id} template={template} onApply={() => void applyTemplate(template.id, date)} />)}
      </section>
    </div>
    <section className="record-lists" aria-label="Saved plan details">
      {plans.map((plan) => <article className="meal-list" key={plan.id}><h3>{plan.name}</h3><p>{plan.sourceType === "external" ? "External reference" : "Custom plan"}</p><p>Source: {plan.sourceName ?? "User"}</p>{plan.sourceUrl && <a href={plan.sourceUrl}>Reference link</a>}{plan.sourceDate && <p>Date: {plan.sourceDate}</p>}<p>{plan.description}</p></article>)}
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
