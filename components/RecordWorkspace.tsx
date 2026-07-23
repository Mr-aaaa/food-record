"use client";

import { useMemo, useState } from "react";
import { BUILT_IN_FOODS } from "@/data/foods";
import { parseImportedMeal } from "@/domain/input-schema";
import { buildCorrectionPrompt, buildPortablePrompt, buildSchemaPrompt } from "@/domain/prompt";
import { localDateKey } from "@/domain/local-date";
import { mealRecordFromDraft } from "@/domain/workflows";
import type {
  CustomFood, DisplayUnit, FoodItem, MealDraft, MealRecord, MealStatus, MealType, ValidationResult,
} from "@/domain/types";
import { useAppStore } from "@/state/app-store";

export type ClipboardAdapter = { writeText: (text: string) => Promise<void> };

type AvailableFood = {
  id: string;
  name: string;
  servingUnit: "g" | "ml";
  nutritionPer100: { caloriesKcal: number; proteinG: number; carbohydrateG: number; fatG: number };
  source: CustomFood["dataSource"];
  displayUnits?: CustomFood["displayUnits"];
};

type EditForm = {
  name: string;
  amount: string;
  unit: "g" | "ml";
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  status: MealStatus;
  mealType: MealType;
  date: string;
};

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const displayUnitLabels: Record<DisplayUnit, string> = {
  g: "g", ml: "ml", bowl: "bowl (碗)", serving: "serving (份)", spoon: "spoon (勺)", piece: "piece (个)",
};

function defaultClipboard(): ClipboardAdapter | undefined {
  const clipboard = globalThis.navigator?.clipboard;
  return clipboard ? { writeText: (text) => clipboard.writeText(text) } : undefined;
}

function sourceText(source: AvailableFood["source"] | undefined) {
  return source?.name ?? "Manual entry";
}

function isoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function draftIssues(draft: MealDraft | null): string[] {
  if (!draft) return [];
  const issues: string[] = [];
  if (!isoDate(draft.date)) issues.push("date must be YYYY-MM-DD");
  draft.items.forEach((item, index) => {
    if (item.amount === null || item.amount <= 0) issues.push(`items[${index}].amount is required`);
    if (item.isAmbiguous) issues.push(`items[${index}] identity is ambiguous`);
    if (item.dataSource.confidence < 0.5) issues.push(`items[${index}] source confidence is below 0.5`);
  });
  return issues;
}

export default function RecordWorkspace({ clipboard, date = localDateKey(new Date()) }: Readonly<{ clipboard?: ClipboardAdapter; date?: string }>) {
  const {
    records, customFoods, saveMeal, copyMeal, copyMealItem, moveMealItem, deleteMealItem,
    restoreMealItem, saveCustomFood, deactivateCustomFood, copyCustomFood,
  } = useAppStore();
  const [rawText, setRawText] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult<MealDraft> | null>(null);
  const [previewDraft, setPreviewDraft] = useState<MealDraft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [search, setSearch] = useState("");
  const [foodId, setFoodId] = useState("");
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState<DisplayUnit>("g");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [status, setStatus] = useState<MealStatus>("consumed");
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCalories, setCustomCalories] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbohydrate, setCustomCarbohydrate] = useState("0");
  const [customFat, setCustomFat] = useState("0");
  const [customServingUnit, setCustomServingUnit] = useState<"g" | "ml">("g");
  const [customDisplayUnit, setCustomDisplayUnit] = useState<"bowl" | "serving" | "spoon" | "piece">("serving");
  const [customConversion, setCustomConversion] = useState("");
  const [moveRecord, setMoveRecord] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [moveMealType, setMoveMealType] = useState<MealType>("lunch");
  const [deletedItem, setDeletedItem] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [editingItem, setEditingItem] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [traceItem, setTraceItem] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState(date);
  const [copyStatusTarget, setCopyStatusTarget] = useState<MealStatus>("planned");
  const [copyMealType, setCopyMealType] = useState<MealType>("breakfast");

  const availableFoods = useMemo<AvailableFood[]>(() => [
    ...BUILT_IN_FOODS.map((food) => ({ id: food.id, name: food.name, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100, source: food.source })),
    ...customFoods.filter((food) => food.active !== false).map((food) => ({
      id: food.id, name: food.name, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100,
      source: food.dataSource, displayUnits: food.displayUnits,
    })),
  ], [customFoods]);
  const matchingFoods = availableFoods.filter((food) => food.name.toLowerCase().includes(search.toLowerCase()));
  const selectedFood = availableFoods.find((food) => food.id === foodId);
  const selectedConversion = selectedFood?.displayUnits?.find((conversion) => conversion.unit === unit);
  const dayRecords = records.filter((record) => record.date === date);
  const consumedRecords = dayRecords.filter((record) => record.status === "consumed");
  const plannedRecords = dayRecords.filter((record) => record.status === "planned");
  const correctionIssues = draftIssues(previewDraft);
  const canConfirmPreview = Boolean(previewDraft && validationResult?.ok && correctionIssues.length === 0);

  async function copyText(text: string, success: string) {
    const adapter = clipboard ?? defaultClipboard();
    if (!text || !adapter) { setCopyStatus("Clipboard is unavailable"); return; }
    try { await adapter.writeText(text); setCopyStatus(success); } catch { setCopyStatus("Could not copy text"); }
  }

  function validateJson() {
    const result = parseImportedMeal(pastedJson);
    setValidationResult(result);
    setPreviewDraft(result.value ? structuredClone(result.value) : null);
    setSaveError("");
  }

  function patchDraft(patch: Partial<MealDraft>) {
    setPreviewDraft((current) => current ? { ...current, ...patch } : current);
  }

  function patchDraftItem(index: number, patch: Partial<MealDraft["items"][number]>) {
    setPreviewDraft((current) => current ? {
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  }

  async function confirmImport() {
    if (!previewDraft || !canConfirmPreview) return;
    try {
      await saveMeal(mealRecordFromDraft(previewDraft, pastedJson));
      setPreviewDraft(null); setPastedJson(""); setValidationResult(null); setSaveError("");
    } catch { setSaveError("Could not save meal"); }
  }

  async function saveImportedAsCustom(item: MealDraft["items"][number]) {
    if (!item.amount || item.amount <= 0) { setSaveError("Correct the imported amount before saving a custom food"); return; }
    const multiplier = 100 / item.amount;
    try {
      await saveCustomFood({
        id: makeId("custom"), name: item.name, servingUnit: item.unit, active: true,
        nutritionPer100: {
          caloriesKcal: item.nutrition.caloriesKcal * multiplier,
          proteinG: item.nutrition.proteinG * multiplier,
          carbohydrateG: item.nutrition.carbohydrateG * multiplier,
          fatG: item.nutrition.fatG * multiplier,
        },
        dataSource: { ...item.dataSource, type: "user_custom", name: `Saved from ${item.dataSource.name}` },
      });
      setSaveError("");
    } catch { setSaveError("Could not save imported food"); }
  }

  async function saveManualFood() {
    const numericAmount = Number(amount);
    if (!selectedFood || !Number.isFinite(numericAmount) || numericAmount <= 0) { setSaveError("Choose a food and enter a positive amount"); return; }
    const baseAmount = selectedConversion ? numericAmount * selectedConversion.gramsOrMl : numericAmount;
    if (!selectedConversion && unit !== selectedFood.servingUnit) { setSaveError("Choose a supported unit"); return; }
    const multiplier = baseAmount / 100;
    const record: MealRecord = { id: makeId("manual"), date, mealType, status, foodItems: [{
      id: makeId("item"), name: selectedFood.name, amount: numericAmount, unit: selectedFood.servingUnit,
      displayUnit: unit, gramsPerDisplayUnit: selectedConversion?.gramsOrMl,
      caloriesKcal: selectedFood.nutritionPer100.caloriesKcal * multiplier,
      nutrition: {
        proteinG: selectedFood.nutritionPer100.proteinG * multiplier,
        carbohydrateG: selectedFood.nutritionPer100.carbohydrateG * multiplier,
        fatG: selectedFood.nutritionPer100.fatG * multiplier,
      },
      dataSource: selectedFood.source,
    }] };
    try { await saveMeal(record); setSaveError(""); } catch { setSaveError("Could not save meal"); }
  }

  function resetCustomForm() {
    setCustomId(""); setCustomName(""); setCustomCalories(""); setCustomProtein("");
    setCustomCarbohydrate("0"); setCustomFat("0"); setCustomServingUnit("g"); setCustomConversion("");
  }

  async function createCustomFood() {
    const calories = Number(customCalories); const protein = Number(customProtein);
    const carbohydrate = Number(customCarbohydrate); const fat = Number(customFat);
    const conversion = customConversion.trim() ? Number(customConversion) : undefined;
    if (!customName.trim() || [calories, protein, carbohydrate, fat].some((value) => !Number.isFinite(value) || value < 0) || (conversion !== undefined && (!Number.isFinite(conversion) || conversion <= 0))) {
      setSaveError("Enter a custom food and non-negative nutrition values"); return;
    }
    const id = customId || `custom-${customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || makeId("food")}`;
    try {
      await saveCustomFood({
        id, name: customName.trim(), servingUnit: customServingUnit, active: true,
        displayUnits: conversion ? [{ unit: customDisplayUnit, gramsOrMl: conversion }] : undefined,
        nutritionPer100: { caloriesKcal: calories, proteinG: protein, carbohydrateG: carbohydrate, fatG: fat },
        dataSource: { type: "user_custom", name: "Custom food", confidence: 1, isEstimated: false },
      });
      setSaveError(""); setFoodId(id); setUnit(customServingUnit); setSearch(customName.trim()); resetCustomForm();
    } catch { setSaveError("Could not save custom food"); }
  }

  function editCustomFood(food: CustomFood) {
    setCustomId(food.id); setCustomName(food.name); setCustomCalories(String(food.nutritionPer100.caloriesKcal));
    setCustomProtein(String(food.nutritionPer100.proteinG)); setCustomCarbohydrate(String(food.nutritionPer100.carbohydrateG));
    setCustomFat(String(food.nutritionPer100.fatG)); setCustomServingUnit(food.servingUnit);
    setCustomDisplayUnit(food.displayUnits?.[0]?.unit ?? "serving");
    setCustomConversion(food.displayUnits?.[0]?.gramsOrMl ? String(food.displayUnits[0].gramsOrMl) : "");
  }

  async function copyItem(record: MealRecord, item: FoodItem) { try { await copyMealItem(record.id, item.id); setSaveError(""); } catch { setSaveError("Could not copy food"); } }
  async function confirmMove() { if (!moveRecord) return; try { await moveMealItem(moveRecord.record.id, moveRecord.item.id, moveMealType); setSaveError(""); setMoveRecord(null); } catch { setSaveError("Could not move food"); } }
  async function removeItem(record: MealRecord, item: FoodItem) { try { await deleteMealItem(record.id, item.id); setSaveError(""); setDeletedItem({ record, item }); } catch { setSaveError("Could not delete food"); } }
  async function undoDelete() { if (!deletedItem) return; try { await restoreMealItem(deletedItem.record, deletedItem.item); setSaveError(""); setDeletedItem(null); } catch { setSaveError("Could not undo delete"); } }

  function startItemEdit(record: MealRecord, item: FoodItem) {
    setEditingItem({ record, item });
    setEditForm({
      name: item.name, amount: String(item.amount ?? 0), unit: item.unit ?? "g",
      calories: String(item.caloriesKcal), protein: String(item.nutrition.proteinG),
      carbohydrate: String(item.nutrition.carbohydrateG), fat: String(item.nutrition.fatG),
      status: record.status, mealType: record.mealType, date: record.date,
    });
  }

  async function confirmFoodEdit() {
    if (!editingItem || !editForm?.name.trim()) return;
    const values = [editForm.amount, editForm.calories, editForm.protein, editForm.carbohydrate, editForm.fat].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0) || !isoDate(editForm.date)) {
      setSaveError("Enter valid non-negative nutrition values and date"); return;
    }
    try {
      const [nextAmount, caloriesKcal, proteinG, carbohydrateG, fatG] = values;
      const updated: MealRecord = {
        ...editingItem.record, date: editForm.date, mealType: editForm.mealType, status: editForm.status,
        foodItems: editingItem.record.foodItems.map((item) => item.id === editingItem.item.id ? {
          ...item, name: editForm.name.trim(), amount: nextAmount, unit: editForm.unit, caloriesKcal,
          nutrition: { proteinG, carbohydrateG, fatG },
        } : item),
      };
      await saveMeal(updated);
      setSaveError(""); setEditingItem(null); setEditForm(null);
    } catch { setSaveError("Could not edit food"); }
  }

  async function copyPreviousMeal() {
    const previous = [...records].filter((record) => record.date < date).sort((left, right) => right.date.localeCompare(left.date))[0];
    if (!previous) { setSaveError("No earlier meal is available"); return; }
    try { await copyMeal(previous.id, copyTargetDate, copyStatusTarget); setSaveError(""); } catch { setSaveError("Could not copy previous meal"); }
  }

  async function copyYesterdaySameMeal() {
    const yesterday = new Date(`${date}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const previousDate = localDateKey(yesterday);
    const previous = records.find((record) => record.date === previousDate && record.mealType === copyMealType);
    if (!previous) { setSaveError("No matching meal was recorded yesterday"); return; }
    try { await copyMeal(previous.id, copyTargetDate, copyStatusTarget); setSaveError(""); } catch { setSaveError("Could not copy yesterday meal"); }
  }

  return <section className="record-workspace" id="record" aria-labelledby="record-heading">
    <p className="eyebrow">Record</p><h2 id="record-heading">Record meals · {date}</h2>
    <div className="record-grid">
      <section className="workspace-card">
        <h3>Portable prompt</h3>
        <p className="privacy-note">Third-party AI receives whatever you paste. Remove names, health details, and other private data before copying.</p>
        <label>Natural language meal<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} /></label>
        <button className="primary-button" type="button" onClick={() => setGeneratedPrompt(buildPortablePrompt(rawText, "1.0", date))}>Generate portable prompt</button>
        {generatedPrompt && <>
          <label>Generated prompt<textarea readOnly value={generatedPrompt} /></label>
          <button type="button" onClick={() => void copyText(generatedPrompt, "Full prompt copied")}>Copy full prompt</button>
          <button type="button" onClick={() => void copyText(buildSchemaPrompt("1.0"), "Schema copied")}>Copy schema only</button>
        </>}
        {copyStatus && <p role="status">{copyStatus}</p>}
        <label>Paste meal JSON<textarea value={pastedJson} onChange={(event) => { setPastedJson(event.target.value); setValidationResult(null); setPreviewDraft(null); }} /></label>
        <button type="button" onClick={validateJson}>Validate JSON</button>
        {validationResult && <div role="alert">{validationResult.issues.length ? validationResult.issues.map((issue) => <p key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</p>) : "JSON is ready to preview"}</div>}
        {previewDraft && <div className="preview">
          <h3>Preview</h3><p>Review and correct before import.</p>
          <label>Imported date<input type="date" value={previewDraft.date} onChange={(event) => patchDraft({ date: event.target.value })} /></label>
          <label>Imported meal type<select value={previewDraft.mealType} onChange={(event) => patchDraft({ mealType: event.target.value as MealType })}>{mealTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Imported status<select value={previewDraft.status} onChange={(event) => patchDraft({ status: event.target.value as MealStatus })}><option value="planned">planned</option><option value="consumed">consumed</option></select></label>
          {previewDraft.items.map((item, index) => <fieldset key={item.itemId}>
            <legend>{item.name}</legend>
            <label>Imported amount {index + 1}<input type="number" min="0" value={item.amount ?? ""} onChange={(event) => patchDraftItem(index, { amount: event.target.value ? Number(event.target.value) : null })} /></label>
            <label className="checkbox-label"><input aria-label={`Imported ambiguity ${index + 1}`} checked={item.isAmbiguous} type="checkbox" onChange={(event) => patchDraftItem(index, { isAmbiguous: event.target.checked })} />Identity remains ambiguous</label>
            <label>Imported source confidence {index + 1}<input type="number" min="0" max="1" step="0.1" value={item.dataSource.confidence} onChange={(event) => patchDraftItem(index, { dataSource: { ...item.dataSource, confidence: Number(event.target.value) } })} /></label>
            <p><span className="source-badge">Source: {sourceText(item.dataSource)}</span></p>
            <button type="button" onClick={() => void saveImportedAsCustom(item)}>Save {item.name} as custom food</button>
          </fieldset>)}
          {correctionIssues.length > 0 && <div className="error-summary"><strong>Resolve before confirming:</strong><ul>{correctionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <button type="button" onClick={() => void copyText(buildCorrectionPrompt(pastedJson, correctionIssues, previewDraft.date), "Correction prompt copied")}>Copy correction prompt</button>
          <button className="primary-button" type="button" disabled={!canConfirmPreview} onClick={() => void confirmImport()}>Confirm meal</button>
        </div>}
      </section>
      <section className="workspace-card">
        <h3>Manual food</h3>
        <label>Food search<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Food<select value={foodId} onChange={(event) => { setFoodId(event.target.value); const next = availableFoods.find((food) => food.id === event.target.value); if (next) setUnit(next.servingUnit); }}><option value="">Choose food</option>{matchingFoods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</select></label>
        <label>Amount<input aria-description="Quantity in the selected unit" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Unit<select value={unit} onChange={(event) => setUnit(event.target.value as DisplayUnit)}>
          <option value={selectedFood?.servingUnit ?? "g"}>{selectedFood?.servingUnit ?? "g"}</option>
          {selectedFood?.displayUnits?.map((conversion) => <option key={conversion.unit} value={conversion.unit}>{displayUnitLabels[conversion.unit]} = {conversion.gramsOrMl} {selectedFood.servingUnit}</option>)}
        </select></label>
        <label>Meal type<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Record status<select value={status} onChange={(event) => setStatus(event.target.value as MealStatus)}><option value="consumed">consumed</option><option value="planned">planned</option></select></label>
        <button className="primary-button" type="button" onClick={() => void saveManualFood()}>Add food to day</button>
        <h3>{customId ? "Edit custom food" : "Custom food"}</h3>
        <label>Custom food name<input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
        <label>Custom base unit<select value={customServingUnit} onChange={(event) => setCustomServingUnit(event.target.value as "g" | "ml")}><option value="g">g</option><option value="ml">ml</option></select></label>
        <label>Custom calories per 100<input type="number" value={customCalories} onChange={(event) => setCustomCalories(event.target.value)} /></label>
        <label>Custom protein per 100<input type="number" value={customProtein} onChange={(event) => setCustomProtein(event.target.value)} /></label>
        <label>Custom carbohydrate per 100<input type="number" value={customCarbohydrate} onChange={(event) => setCustomCarbohydrate(event.target.value)} /></label>
        <label>Custom fat per 100<input type="number" value={customFat} onChange={(event) => setCustomFat(event.target.value)} /></label>
        <label>Display unit<select value={customDisplayUnit} onChange={(event) => setCustomDisplayUnit(event.target.value as typeof customDisplayUnit)}><option value="bowl">bowl (碗)</option><option value="serving">serving (份)</option><option value="spoon">spoon (勺)</option><option value="piece">piece (个)</option></select></label>
        <label>Display unit conversion<input type="number" min="0" value={customConversion} onChange={(event) => setCustomConversion(event.target.value)} placeholder={`Equivalent ${customServingUnit}`} /></label>
        <button type="button" onClick={() => void createCustomFood()}>{customId ? "Update custom food" : "Save custom food"}</button>
        {customId && <button type="button" onClick={resetCustomForm}>Cancel custom food edit</button>}
        <section aria-label="Custom food library">{customFoods.length === 0 ? <p>No custom foods yet</p> : customFoods.map((food) => <article key={food.id}><strong>{food.name}</strong> · {food.active === false ? "inactive" : "active"}<button type="button" onClick={() => editCustomFood(food)}>Edit custom food {food.name}</button><button type="button" onClick={() => void copyCustomFood(food.id)}>Copy custom food {food.name}</button>{food.active !== false && <button type="button" onClick={() => void deactivateCustomFood(food.id)}>Deactivate custom food {food.name}</button>}</article>)}</section>
      </section>
    </div>
    <section className="workspace-card" aria-label="Meal copy tools">
      <h3>Copy meal</h3>
      <label>Copy target date<input type="date" value={copyTargetDate} onChange={(event) => setCopyTargetDate(event.target.value)} /></label>
      <label>Copy target status<select value={copyStatusTarget} onChange={(event) => setCopyStatusTarget(event.target.value as MealStatus)}><option value="planned">planned</option><option value="consumed">consumed</option></select></label>
      <label>Yesterday meal type<select value={copyMealType} onChange={(event) => setCopyMealType(event.target.value as MealType)}>{mealTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={() => void copyPreviousMeal()}>Copy previous meal</button>
      <button type="button" onClick={() => void copyYesterdaySameMeal()}>Copy yesterday same meal</button>
    </section>
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    {moveRecord && <section className="move-panel"><label>Move copied meal to<select value={moveMealType} onChange={(event) => setMoveMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><button type="button" onClick={() => void confirmMove()}>Confirm move</button></section>}
    {editingItem && editForm && <section className="move-panel" aria-label={`Edit ${editingItem.item.name}`}>
      <label>Edit food name<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
      <label>Edit amount<input type="number" min="0" value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} /></label>
      <label>Edit unit<select value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value as "g" | "ml" })}><option value="g">g</option><option value="ml">ml</option></select></label>
      <label>Edit calories<input type="number" min="0" value={editForm.calories} onChange={(event) => setEditForm({ ...editForm, calories: event.target.value })} /></label>
      <label>Edit protein<input type="number" min="0" value={editForm.protein} onChange={(event) => setEditForm({ ...editForm, protein: event.target.value })} /></label>
      <label>Edit carbohydrate<input type="number" min="0" value={editForm.carbohydrate} onChange={(event) => setEditForm({ ...editForm, carbohydrate: event.target.value })} /></label>
      <label>Edit fat<input type="number" min="0" value={editForm.fat} onChange={(event) => setEditForm({ ...editForm, fat: event.target.value })} /></label>
      <label>Edit status<select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as MealStatus })}><option value="planned">planned</option><option value="consumed">consumed</option></select></label>
      <label>Edit meal type<select value={editForm.mealType} onChange={(event) => setEditForm({ ...editForm, mealType: event.target.value as MealType })}>{mealTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Edit date<input type="date" value={editForm.date} onChange={(event) => setEditForm({ ...editForm, date: event.target.value })} /></label>
      <button type="button" onClick={() => void confirmFoodEdit()}>Save food edit</button>
    </section>}
    {traceItem?.record.audit && <section className="move-panel" aria-label={`Traceability for ${traceItem.item.name}`}>
      <h3>Import traceability</h3><p>{traceItem.record.audit.rawText}</p><p>Schema: {traceItem.record.audit.schemaVersion}</p><p>AI processed: {traceItem.record.audit.aiProcessedAt}</p>
      <details><summary>Original JSON</summary><pre>{traceItem.record.audit.originalJson}</pre></details>
      <button type="button" onClick={() => setTraceItem(null)}>Close traceability</button>
    </section>}
    {deletedItem && <button type="button" onClick={() => void undoDelete()}>Undo delete</button>}
    <section className="record-lists">
      <MealList title="Consumed" records={consumedRecords} onCopy={copyItem} onMove={setMoveRecord} onDelete={removeItem} onEdit={startItemEdit} onTrace={setTraceItem} />
      <MealList title="Planned" records={plannedRecords} onCopy={copyItem} onMove={setMoveRecord} onDelete={removeItem} onEdit={startItemEdit} onTrace={setTraceItem} />
    </section>
  </section>;
}

function MealList({ title, records, onCopy, onMove, onDelete, onEdit, onTrace }: {
  title: string;
  records: MealRecord[];
  onCopy: (record: MealRecord, item: FoodItem) => void;
  onMove: (value: { record: MealRecord; item: FoodItem }) => void;
  onDelete: (record: MealRecord, item: FoodItem) => void;
  onEdit: (record: MealRecord, item: FoodItem) => void;
  onTrace: (value: { record: MealRecord; item: FoodItem }) => void;
}) {
  return <section className="meal-list"><h3>{title}</h3>{records.length === 0 ? <p>No records</p> : records.map((record) => <article key={record.id}><p>{record.mealType} · {record.status}</p>{record.foodItems.map((item) => <div className="meal-item" key={item.id}><strong>{item.name}</strong> · {item.amount ?? "—"} {item.displayUnit ?? item.unit ?? ""} · {Math.round(item.caloriesKcal)} kcal <span className="source-badge">Source: {sourceText(item.dataSource)}</span><button type="button" onClick={() => onCopy(record, item)}>Copy {item.name}</button><button type="button" onClick={() => onMove({ record, item })}>Move {item.name}</button><button type="button" onClick={() => onEdit(record, item)}>Edit {item.name}</button>{record.audit && <button type="button" onClick={() => onTrace({ record, item })}>View traceability for {item.name}</button>}<button type="button" onClick={() => onDelete(record, item)}>Delete {item.name}</button></div>)}</article>)}</section>;
}
