"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_FOODS } from "@/data/foods";
import { parseImportedMeal } from "@/domain/input-schema";
import { buildPortablePrompt } from "@/domain/prompt";
import type { CustomFood, MealRecord, MealStatus, MealType, ValidationResult } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

export type ClipboardAdapter = { writeText: (text: string) => Promise<void> };

type AvailableFood = {
  id: string;
  name: string;
  servingUnit: "g" | "ml";
  nutritionPer100: { caloriesKcal: number; proteinG: number; carbohydrateG: number; fatG: number };
  source: CustomFood["dataSource"];
};

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function defaultClipboard(): ClipboardAdapter | undefined {
  const clipboard = globalThis.navigator?.clipboard;
  return clipboard ? { writeText: (text) => clipboard.writeText(text) } : undefined;
}

function sourceText(source: AvailableFood["source"] | undefined) {
  return source?.name ?? "Manual entry";
}

function recordFromDraft(result: NonNullable<ValidationResult<import("@/domain/types").MealDraft>["value"]>): MealRecord {
  return {
    id: result.recordId,
    date: result.date,
    mealType: result.mealType,
    status: result.status,
    foodItems: result.items.map((item) => ({
      id: item.itemId, name: item.name, caloriesKcal: item.nutrition.caloriesKcal,
      nutrition: { proteinG: item.nutrition.proteinG, carbohydrateG: item.nutrition.carbohydrateG, fatG: item.nutrition.fatG },
      amount: item.amount ?? undefined, unit: item.unit, dataSource: item.dataSource,
    })),
  };
}

export default function RecordWorkspace({ clipboard }: Readonly<{ clipboard?: ClipboardAdapter }>) {
  const { records, customFoods, saveMeal, deleteMeal, saveCustomFood } = useAppStore();
  const [rawText, setRawText] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult<import("@/domain/types").MealDraft> | null>(null);
  const [previewDraft, setPreviewDraft] = useState<import("@/domain/types").MealDraft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [search, setSearch] = useState("");
  const [foodId, setFoodId] = useState("");
  const [amount, setAmount] = useState("100");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [status, setStatus] = useState<MealStatus>("consumed");
  const [customName, setCustomName] = useState("");
  const [customCalories, setCustomCalories] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbohydrate, setCustomCarbohydrate] = useState("0");
  const [customFat, setCustomFat] = useState("0");
  const [moveRecord, setMoveRecord] = useState<MealRecord | null>(null);
  const [moveMealType, setMoveMealType] = useState<MealType>("lunch");
  const [deletedRecord, setDeletedRecord] = useState<MealRecord | null>(null);

  const availableFoods = useMemo<AvailableFood[]>(() => [
    ...BUILT_IN_FOODS.map((food) => ({ id: food.id, name: food.name, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100, source: food.source })),
    ...customFoods.map((food) => ({ id: food.id, name: food.name, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100, source: food.dataSource })),
  ], [customFoods]);
  const matchingFoods = availableFoods.filter((food) => food.name.toLowerCase().includes(search.toLowerCase()));
  const selectedFood = availableFoods.find((food) => food.id === foodId);
  const consumedRecords = records.filter((record) => record.status === "consumed");
  const plannedRecords = records.filter((record) => record.status === "planned");

  async function copyPrompt() {
    const adapter = clipboard ?? defaultClipboard();
    if (!generatedPrompt || !adapter) { setCopyStatus("Clipboard is unavailable"); return; }
    try { await adapter.writeText(generatedPrompt); setCopyStatus("Prompt copied"); } catch { setCopyStatus("Could not copy prompt"); }
  }
  function validateJson() {
    const result = parseImportedMeal(pastedJson);
    setValidationResult(result);
    setPreviewDraft(result.value ?? null);
    setSaveError("");
  }
  async function confirmImport() {
    if (!validationResult?.value || !validationResult.canConfirm) return;
    try { await saveMeal(recordFromDraft(validationResult.value)); setPreviewDraft(null); setPastedJson(""); setValidationResult(null); }
    catch { setSaveError("Could not save meal"); }
  }
  async function saveManualFood() {
    if (!selectedFood || !Number.isFinite(Number(amount)) || Number(amount) <= 0) { setSaveError("Choose a food and enter a positive amount"); return; }
    const multiplier = Number(amount) / 100;
    const record: MealRecord = { id: makeId("manual"), date: new Date().toISOString().slice(0, 10), mealType, status, foodItems: [{
      id: makeId("item"), name: selectedFood.name, amount: Number(amount), unit: selectedFood.servingUnit,
      caloriesKcal: selectedFood.nutritionPer100.caloriesKcal * multiplier,
      nutrition: { proteinG: selectedFood.nutritionPer100.proteinG * multiplier, carbohydrateG: selectedFood.nutritionPer100.carbohydrateG * multiplier, fatG: selectedFood.nutritionPer100.fatG * multiplier },
      dataSource: selectedFood.source,
    }] };
    try { await saveMeal(record); setSaveError(""); } catch { setSaveError("Could not save meal"); }
  }
  async function createCustomFood() {
    const calories = Number(customCalories); const protein = Number(customProtein); const carbohydrate = Number(customCarbohydrate); const fat = Number(customFat);
    if (!customName.trim() || [calories, protein, carbohydrate, fat].some((value) => !Number.isFinite(value) || value < 0)) { setSaveError("Enter a custom food and non-negative nutrition values"); return; }
    const id = `custom-${customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || makeId("food")}`;
    await saveCustomFood({ id, name: customName.trim(), servingUnit: "g", nutritionPer100: { caloriesKcal: calories, proteinG: protein, carbohydrateG: carbohydrate, fatG: fat }, dataSource: { type: "user_custom", name: "Custom food", confidence: 1, isEstimated: false } });
    setFoodId(id); setSearch(customName.trim()); setCustomName(""); setCustomCalories(""); setCustomProtein(""); setCustomCarbohydrate("0"); setCustomFat("0");
  }
  async function copyRecord(record: MealRecord) { await saveMeal({ ...record, id: makeId("copy"), foodItems: record.foodItems.map((item) => ({ ...item, id: makeId("item") })) }); }
  async function confirmMove() { if (!moveRecord) return; await saveMeal({ ...moveRecord, mealType: moveMealType }); setMoveRecord(null); }
  async function removeRecord(record: MealRecord) { await deleteMeal(record.id); setDeletedRecord(record); }
  async function undoDelete() { if (!deletedRecord) return; await saveMeal(deletedRecord); setDeletedRecord(null); }

  return <section className="record-workspace" id="record" aria-labelledby="record-heading">
    <p className="eyebrow">Record</p><h2 id="record-heading">Record meals</h2>
    <div className="record-grid">
      <section className="workspace-card">
        <h3>Portable prompt</h3>
        <label>Natural language meal<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} /></label>
        <button className="primary-button" type="button" onClick={() => setGeneratedPrompt(buildPortablePrompt(rawText, "1.0"))}>Generate portable prompt</button>
        {generatedPrompt && <><label>Generated prompt<textarea readOnly value={generatedPrompt} /></label><button type="button" onClick={copyPrompt}>Copy prompt</button></>}
        {copyStatus && <p role="status">{copyStatus}</p>}
        <label>Paste meal JSON<textarea value={pastedJson} onChange={(event) => setPastedJson(event.target.value)} /></label>
        <button type="button" onClick={validateJson}>Validate JSON</button>
        {validationResult && <div role="alert">{validationResult.issues.length ? validationResult.issues.map((issue) => <p key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</p>) : "JSON is ready to preview"}</div>}
        {previewDraft && <div className="preview"><h3>Preview</h3>{previewDraft.items.map((item) => <p key={item.itemId}>{item.name} · {item.amount ?? "amount needed"} {item.unit} <span className="source-badge">Source: {sourceText(item.dataSource)}</span></p>)}<button className="primary-button" type="button" disabled={!validationResult?.canConfirm} onClick={confirmImport}>Confirm meal</button></div>}
      </section>
      <section className="workspace-card">
        <h3>Manual food</h3>
        <label>Food search<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Food<select value={foodId} onChange={(event) => setFoodId(event.target.value)}><option value="">Choose food</option>{matchingFoods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</select></label>
        <label>Amount<input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Meal type<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Record status<select value={status} onChange={(event) => setStatus(event.target.value as MealStatus)}><option value="consumed">consumed</option><option value="planned">planned</option></select></label>
        <button className="primary-button" type="button" onClick={saveManualFood}>Add food to day</button>
        <h3>Custom food</h3>
        <label>Custom food name<input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
        <label>Custom calories per 100<input type="number" value={customCalories} onChange={(event) => setCustomCalories(event.target.value)} /></label>
        <label>Custom protein per 100<input type="number" value={customProtein} onChange={(event) => setCustomProtein(event.target.value)} /></label>
        <label>Custom carbohydrate per 100<input type="number" value={customCarbohydrate} onChange={(event) => setCustomCarbohydrate(event.target.value)} /></label>
        <label>Custom fat per 100<input type="number" value={customFat} onChange={(event) => setCustomFat(event.target.value)} /></label>
        <button type="button" onClick={createCustomFood}>Save custom food</button>
      </section>
    </div>
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    {moveRecord && <section className="move-panel"><label>Move copied meal to<select value={moveMealType} onChange={(event) => setMoveMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><button type="button" onClick={confirmMove}>Confirm move</button></section>}
    {deletedRecord && <button type="button" onClick={undoDelete}>Undo delete</button>}
    <section className="record-lists"><MealList title="Consumed" records={consumedRecords} onCopy={copyRecord} onMove={setMoveRecord} onDelete={removeRecord} /><MealList title="Planned" records={plannedRecords} onCopy={copyRecord} onMove={setMoveRecord} onDelete={removeRecord} /></section>
  </section>;
}

function MealList({ title, records, onCopy, onMove, onDelete }: { title: string; records: MealRecord[]; onCopy: (record: MealRecord) => void; onMove: (record: MealRecord) => void; onDelete: (record: MealRecord) => void }) {
  return <section className="meal-list"><h3>{title}</h3>{records.length === 0 ? <p>No records</p> : records.map((record) => <article key={record.id}><p>{record.mealType}</p>{record.foodItems.map((item) => <div key={item.id}><strong>{item.name}</strong> · {Math.round(item.caloriesKcal)} kcal <span className="source-badge">Source: {sourceText(item.dataSource)}</span></div>)}<button type="button" onClick={() => onCopy(record)}>Copy {record.foodItems[0]?.name}</button><button type="button" onClick={() => onMove(record)}>Move {record.foodItems[0]?.name}</button><button type="button" onClick={() => onDelete(record)}>Delete {record.foodItems[0]?.name}</button></article>)}</section>;
}
