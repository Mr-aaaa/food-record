"use client";

import { useMemo, useState, type SVGProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BUILT_IN_FOODS, FOOD_CATEGORY_LABELS, FOOD_CATEGORY_ORDER, type FoodCategory } from "@/data/foods";
import { parseImportedMeal } from "@/domain/input-schema";
import { buildCorrectionPrompt, buildPortablePrompt, buildSchemaPrompt } from "@/domain/prompt";
import { localDateKey } from "@/domain/local-date";
import { mealRecordFromDraft } from "@/domain/workflows";
import type {
  CustomFood, DisplayUnit, FoodItem, MealDraft, MealRecord, MealStatus, MealType, ValidationResult,
} from "@/domain/types";
import { useAppStore } from "@/state/app-store";
import Modal from "@/components/ui/Modal";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import { DUR, EASE, useMotionPref } from "@/components/ui/motion";

export type ClipboardAdapter = { writeText: (text: string) => Promise<void> };

type AvailableFood = {
  id: string;
  name: string;
  category: FoodCategory | "custom";
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
const mealTypeLabels: Record<MealType, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
const mealStatusLabels: Record<MealStatus, string> = { planned: "计划中", consumed: "已摄入" };
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const displayUnitLabels: Record<DisplayUnit, string> = {
  g: "g", ml: "ml", bowl: "碗", serving: "份", spoon: "勺", piece: "个",
};

function defaultClipboard(): ClipboardAdapter | undefined {
  const clipboard = globalThis.navigator?.clipboard;
  return clipboard ? { writeText: (text) => clipboard.writeText(text) } : undefined;
}

function sourceText(source: AvailableFood["source"] | undefined) {
  return source?.name ?? "手动录入";
}

function isoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function draftIssues(draft: MealDraft | null): string[] {
  if (!draft) return [];
  const issues: string[] = [];
  if (!isoDate(draft.date)) issues.push("日期格式必须为 YYYY-MM-DD");
  draft.items.forEach((item, index) => {
    if (item.amount === null || item.amount <= 0) issues.push(`第 ${index + 1} 项需要填写份量`);
  });
  return issues;
}

export default function RecordWorkspace({ clipboard, date = localDateKey(new Date()) }: Readonly<{ clipboard?: ClipboardAdapter; date?: string }>) {
  const {
    records, customFoods, saveMeal, copyMeal, copyMealItem, moveMealItem, deleteMealItem,
    restoreMealItem, saveCustomFood, deleteCustomFood, copyCustomFood,
  } = useAppStore();
  const [rawText, setRawText] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult<MealDraft> | null>(null);
  const [previewDraft, setPreviewDraft] = useState<MealDraft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FoodCategory | "custom" | "all">("all");
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
  const [editingItem, setEditingItem] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [traceItem, setTraceItem] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState(date);
  const [copyStatusTarget, setCopyStatusTarget] = useState<MealStatus>("planned");
  const [copyMealType, setCopyMealType] = useState<MealType>("breakfast");
  const [deleteTarget, setDeleteTarget] = useState<{ record: MealRecord; item: FoodItem } | null>(null);
  const { reduce } = useMotionPref();

  const availableFoods = useMemo<AvailableFood[]>(() => [
    ...BUILT_IN_FOODS.map((food) => ({ id: food.id, name: food.name, category: food.category, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100, source: food.source })),
    ...customFoods.filter((food) => food.active !== false).map((food) => ({
      id: food.id, name: food.name, category: "custom" as const, servingUnit: food.servingUnit, nutritionPer100: food.nutritionPer100,
      source: food.dataSource, displayUnits: food.displayUnits,
    })),
  ], [customFoods]);
  const matchingFoods = availableFoods.filter((food) => food.name.toLowerCase().includes(search.toLowerCase()) && (category === "all" || food.category === category));
  const foodGroups = [...FOOD_CATEGORY_ORDER, "custom" as const].map((cat) => ({ category: cat, label: cat === "custom" ? "自定义" : FOOD_CATEGORY_LABELS[cat], items: matchingFoods.filter((food) => food.category === cat) })).filter((group) => group.items.length > 0);
  const selectedFood = availableFoods.find((food) => food.id === foodId);
  const selectedConversion = selectedFood?.displayUnits?.find((conversion) => conversion.unit === unit);
  const dayRecords = records.filter((record) => record.date === date);
  const consumedRecords = dayRecords.filter((record) => record.status === "consumed");
  const plannedRecords = dayRecords.filter((record) => record.status === "planned");
  const correctionIssues = draftIssues(previewDraft);
  const canConfirmPreview = Boolean(previewDraft && validationResult?.ok && correctionIssues.length === 0);

  async function copyText(text: string, success: string) {
    const adapter = clipboard ?? defaultClipboard();
    if (!text || !adapter) { setCopyStatus("剪贴板不可用"); return; }
    try { await adapter.writeText(text); setCopyStatus(success); } catch { setCopyStatus("无法复制文本"); }
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
    } catch { setSaveError("无法保存餐饮记录"); }
  }

  async function saveImportedAsCustom(item: MealDraft["items"][number]) {
    if (!item.amount || item.amount <= 0) { setSaveError("请先修正导入的份量，再保存为自定义食物"); return; }
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
        dataSource: { ...item.dataSource, type: "user_custom", name: `从 ${item.dataSource.name} 保存` },
      });
      setSaveError("");
    } catch { setSaveError("无法保存导入的食物"); }
  }

  async function saveManualFood() {
    const numericAmount = Number(amount);
    if (!selectedFood || !Number.isFinite(numericAmount) || numericAmount <= 0) { setSaveError("请选择食物并输入有效份量"); return; }
    const baseAmount = selectedConversion ? numericAmount * selectedConversion.gramsOrMl : numericAmount;
    if (!selectedConversion && unit !== selectedFood.servingUnit) { setSaveError("请选择支持的单位"); return; }
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
    try { await saveMeal(record); setSaveError(""); } catch { setSaveError("无法保存餐饮记录"); }
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
      setSaveError("请输入自定义食物名称和非负的营养数值"); return;
    }
    const id = customId || `custom-${customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || makeId("food")}`;
    try {
      await saveCustomFood({
        id, name: customName.trim(), servingUnit: customServingUnit, active: true,
        displayUnits: conversion ? [{ unit: customDisplayUnit, gramsOrMl: conversion }] : undefined,
        nutritionPer100: { caloriesKcal: calories, proteinG: protein, carbohydrateG: carbohydrate, fatG: fat },
        dataSource: { type: "user_custom", name: "自定义食物", confidence: 1, isEstimated: false },
      });
      setSaveError(""); setFoodId(id); setUnit(customServingUnit); setSearch(customName.trim()); resetCustomForm();
    } catch { setSaveError("无法保存自定义食物"); }
  }

  function editCustomFood(food: CustomFood) {
    setCustomId(food.id); setCustomName(food.name); setCustomCalories(String(food.nutritionPer100.caloriesKcal));
    setCustomProtein(String(food.nutritionPer100.proteinG)); setCustomCarbohydrate(String(food.nutritionPer100.carbohydrateG));
    setCustomFat(String(food.nutritionPer100.fatG)); setCustomServingUnit(food.servingUnit);
    setCustomDisplayUnit(food.displayUnits?.[0]?.unit ?? "serving");
    setCustomConversion(food.displayUnits?.[0]?.gramsOrMl ? String(food.displayUnits[0].gramsOrMl) : "");
  }

  async function copyItem(record: MealRecord, item: FoodItem) { try { await copyMealItem(record.id, item.id); setSaveError(""); } catch { setSaveError("无法复制食物"); } }
  async function confirmMove() { if (!moveRecord) return; try { await moveMealItem(moveRecord.record.id, moveRecord.item.id, moveMealType); setSaveError(""); setMoveRecord(null); } catch { setSaveError("无法移动食物"); } }
  async function removeItem(value: { record: MealRecord; item: FoodItem }) {
    try { await deleteMealItem(value.record.id, value.item.id); setSaveError(""); setDeleteTarget(value); }
    catch { setSaveError("无法删除食物"); }
  }
  async function undoDelete() { if (!deleteTarget) return; try { await restoreMealItem(deleteTarget.record, deleteTarget.item); setSaveError(""); setDeleteTarget(null); } catch { setSaveError("无法撤销删除"); } }

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
      setSaveError("请输入有效的非负营养数值和日期"); return;
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
    } catch { setSaveError("无法编辑食物"); }
  }

  async function copyPreviousMeal() {
    const previous = [...records].filter((record) => record.date < date).sort((left, right) => right.date.localeCompare(left.date))[0];
    if (!previous) { setSaveError("没有更早的餐饮记录"); return; }
    try { await copyMeal(previous.id, copyTargetDate, copyStatusTarget); setSaveError(""); } catch { setSaveError("无法复制之前的餐饮"); }
  }

  async function copyYesterdaySameMeal() {
    const yesterday = new Date(`${date}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const previousDate = localDateKey(yesterday);
    const previous = records.find((record) => record.date === previousDate && record.mealType === copyMealType);
    if (!previous) { setSaveError("昨天没有匹配的餐饮记录"); return; }
    try { await copyMeal(previous.id, copyTargetDate, copyStatusTarget); setSaveError(""); } catch { setSaveError("无法复制昨天的餐饮"); }
  }

  const aiImportTab: TabItem = {
    id: "ai-import",
    label: "AI 导入",
    content: (
      <section className="workspace-card">
        <h3>便携提示词</h3>
        <p className="privacy-note">第三方 AI 会接收你粘贴的所有内容。复制前请移除姓名、健康信息等隐私数据。</p>
        <label>自然语言餐饮描述<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} /></label>
        <button className="primary-button" type="button" onClick={() => setGeneratedPrompt(buildPortablePrompt(rawText, "1.0", date))}>生成便携提示词</button>
        {generatedPrompt && <>
          <label>生成的提示词<textarea readOnly value={generatedPrompt} /></label>
          <button type="button" onClick={() => void copyText(generatedPrompt, "完整提示词已复制")}>复制完整提示词</button>
          <button type="button" onClick={() => void copyText(buildSchemaPrompt("1.0"), "数据格式已复制")}>仅复制数据格式</button>
        </>}
        {copyStatus && <p role="status">{copyStatus}</p>}
        <label>粘贴餐饮 JSON<textarea value={pastedJson} onChange={(event) => { setPastedJson(event.target.value); setValidationResult(null); setPreviewDraft(null); }} /></label>
        <button type="button" onClick={validateJson}>验证 JSON</button>
        {validationResult && <div role="alert">{validationResult.issues.length ? validationResult.issues.map((issue) => <p key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</p>) : "JSON 可以预览了"}</div>}
        {previewDraft && <div className="preview">
          <h3>预览与编辑</h3><p className="card-hint">导入前可调整份量、单位和营养；不准确的项导入后还能再编辑。</p>
          <label>导入日期<input type="date" value={previewDraft.date} onChange={(event) => patchDraft({ date: event.target.value })} /></label>
          <label>导入餐次<select value={previewDraft.mealType} onChange={(event) => patchDraft({ mealType: event.target.value as MealType })}>{mealTypes.map((value) => <option key={value} value={value}>{mealTypeLabels[value]}</option>)}</select></label>
          <label>导入状态<select value={previewDraft.status} onChange={(event) => patchDraft({ status: event.target.value as MealStatus })}><option value="planned">计划中</option><option value="consumed">已摄入</option></select></label>
          {previewDraft.items.map((item, index) => <fieldset className="import-item" key={item.itemId}>
            <legend className="import-item-name">{item.name}</legend>
            <p className="import-item-nutri">{Math.round(item.nutrition.caloriesKcal)} 千卡 · 蛋白 {item.nutrition.proteinG}g · 碳水 {item.nutrition.carbohydrateG}g · 脂肪 {item.nutrition.fatG}g</p>
            <div className="import-item-fields">
              <label>导入份量 {index + 1}<input type="number" min="0" value={item.amount ?? ""} onChange={(event) => patchDraftItem(index, { amount: event.target.value ? Number(event.target.value) : null })} /></label>
              <label>导入单位 {index + 1}<select value={item.unit} onChange={(event) => patchDraftItem(index, { unit: event.target.value as "g" | "ml" })}><option value="g">g</option><option value="ml">ml</option></select></label>
            </div>
            <div className="import-item-foot">
              <span className="source-badge">来源：{sourceText(item.dataSource)}</span>
              <button type="button" onClick={() => void saveImportedAsCustom(item)}>将 {item.name} 加入自定义食物</button>
            </div>
          </fieldset>)}
          {correctionIssues.length > 0 && <p className="preview-hint">待补充：{correctionIssues.join("；")}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => void copyText(buildCorrectionPrompt(pastedJson, correctionIssues, previewDraft.date), "修正提示词已复制")}>复制修正提示词</button>
            <button className="primary-button" type="button" disabled={!canConfirmPreview} onClick={() => void confirmImport()}>确认导入</button>
          </div>
        </div>}
      </section>
    ),
  };

  const manualTab: TabItem = {
    id: "manual",
    label: "手动录入",
    content: (
      <section className="workspace-card">
        <h3>手动录入食物</h3>
        <label>搜索食物<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按名称搜索，如 鸡胸肉、米饭" /></label>
        <div className="food-category-chips" role="group" aria-label="食物分类">
          <button type="button" aria-pressed={category === "all"} className={category === "all" ? "is-active" : undefined} onClick={() => setCategory("all")}>全部</button>
          {[...FOOD_CATEGORY_ORDER, "custom" as const].map((key) => (
            <button key={key} type="button" aria-pressed={category === key} className={category === key ? "is-active" : undefined} onClick={() => setCategory(key)}>{key === "custom" ? "自定义" : FOOD_CATEGORY_LABELS[key]}</button>
          ))}
        </div>
        <label>食物<select value={foodId} onChange={(event) => { setFoodId(event.target.value); const next = availableFoods.find((food) => food.id === event.target.value); if (next) setUnit(next.servingUnit); }}>
          <option value="">选择食物</option>
          {foodGroups.map((group) => <optgroup key={group.category} label={group.label}>{group.items.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</optgroup>)}
        </select></label>
        {selectedFood && <p className="food-preview"><span className="food-preview-tag">{selectedFood.category === "custom" ? "自定义" : FOOD_CATEGORY_LABELS[selectedFood.category]}</span>每 100{selectedFood.servingUnit}：{Math.round(selectedFood.nutritionPer100.caloriesKcal)} 千卡 · 蛋白 {selectedFood.nutritionPer100.proteinG}g · 碳水 {selectedFood.nutritionPer100.carbohydrateG}g · 脂肪 {selectedFood.nutritionPer100.fatG}g</p>}
        <label>份量<input aria-description="所选单位对应的份量" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>单位<select value={unit} onChange={(event) => setUnit(event.target.value as DisplayUnit)}>
          <option value={selectedFood?.servingUnit ?? "g"}>{selectedFood?.servingUnit ?? "g"}</option>
          {selectedFood?.displayUnits?.map((conversion) => <option key={conversion.unit} value={conversion.unit}>{displayUnitLabels[conversion.unit]} = {conversion.gramsOrMl} {selectedFood.servingUnit}</option>)}
        </select></label>
        <label>餐次<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{mealTypeLabels[type]}</option>)}</select></label>
        <label>记录状态<select value={status} onChange={(event) => setStatus(event.target.value as MealStatus)}><option value="consumed">已摄入</option><option value="planned">计划中</option></select></label>
        <button className="primary-button" type="button" onClick={() => void saveManualFood()}>添加到当日</button>
        <h3>{customId ? "编辑自定义食物" : "自定义食物"}</h3>
        <label>自定义食物名称<input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
        <label>基本单位<select value={customServingUnit} onChange={(event) => setCustomServingUnit(event.target.value as "g" | "ml")}><option value="g">g</option><option value="ml">ml</option></select></label>
        <label>每 100 克热量<input type="number" value={customCalories} onChange={(event) => setCustomCalories(event.target.value)} /></label>
        <label>每 100 克蛋白质<input type="number" value={customProtein} onChange={(event) => setCustomProtein(event.target.value)} /></label>
        <label>每 100 克碳水化合物<input type="number" value={customCarbohydrate} onChange={(event) => setCustomCarbohydrate(event.target.value)} /></label>
        <label>每 100 克脂肪<input type="number" value={customFat} onChange={(event) => setCustomFat(event.target.value)} /></label>
        <label>显示单位<select value={customDisplayUnit} onChange={(event) => setCustomDisplayUnit(event.target.value as typeof customDisplayUnit)}><option value="bowl">碗</option><option value="serving">份</option><option value="spoon">勺</option><option value="piece">个</option></select></label>
        <label>显示单位换算量<input type="number" min="0" value={customConversion} onChange={(event) => setCustomConversion(event.target.value)} placeholder={`换算为 ${customServingUnit}`} /></label>
        <button type="button" onClick={() => void createCustomFood()}>{customId ? "更新自定义食物" : "保存自定义食物"}</button>
        {customId && <button type="button" onClick={resetCustomForm}>取消编辑自定义食物</button>}
        <section aria-label="自定义食物库">
          {customFoods.length === 0 ? <p className="meal-empty">还没有自定义食物，在上方填写后保存即可。</p> : <ul className="custom-food-list">{customFoods.map((food) => (
            <li className="custom-food-row" key={food.id}>
              <div className="custom-food-info"><strong>{food.name}</strong><span className="custom-food-meta">每 100{food.servingUnit}：{Math.round(food.nutritionPer100.caloriesKcal)} 千卡 · 蛋白 {food.nutritionPer100.proteinG}g · 碳水 {food.nutritionPer100.carbohydrateG}g · 脂肪 {food.nutritionPer100.fatG}g{food.active === false ? " · 已停用" : ""}</span></div>
              <div className="custom-food-actions">
                <button type="button" className="food-action" aria-label={`编辑自定义食物 ${food.name}`} title="编辑" onClick={() => editCustomFood(food)}><EditIcon /></button>
                <button type="button" className="food-action" aria-label={`复制自定义食物 ${food.name}`} title="复制" onClick={() => void copyCustomFood(food.id)}><CopyIcon /></button>
                <button type="button" className="food-action food-action--danger" aria-label={`删除自定义食物 ${food.name}`} title="删除" onClick={() => void deleteCustomFood(food.id)}><DeleteIcon /></button>
              </div>
            </li>
          ))}</ul>}
        </section>
      </section>
    ),
  };

  const copyTab: TabItem = {
    id: "copy-meal",
    label: "复制餐饮",
    content: (
      <section className="workspace-card" aria-label="Meal copy tools">
        <h3>复制餐饮</h3>
        <label>复制目标日期<input type="date" value={copyTargetDate} onChange={(event) => setCopyTargetDate(event.target.value)} /></label>
        <label>复制目标状态<select value={copyStatusTarget} onChange={(event) => setCopyStatusTarget(event.target.value as MealStatus)}><option value="planned">计划中</option><option value="consumed">已摄入</option></select></label>
        <label>昨天餐次<select value={copyMealType} onChange={(event) => setCopyMealType(event.target.value as MealType)}>{mealTypes.map((value) => <option key={value} value={value}>{mealTypeLabels[value]}</option>)}</select></label>
        <button type="button" onClick={() => void copyPreviousMeal()}>复制上一餐</button>
        <button type="button" onClick={() => void copyYesterdaySameMeal()}>复制昨天同餐</button>
      </section>
    ),
  };

  return <section className="record-workspace" id="record" aria-labelledby="record-heading">
    <p className="eyebrow">记录</p><h2 id="record-heading">记录餐饮 · {date}</h2>
    <Tabs className="record-grid" label="记录工具" defaultTab="ai-import" tabs={[aiImportTab, manualTab, copyTab]} />
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    <Modal open={Boolean(moveRecord)} onClose={() => setMoveRecord(null)} title="移动到餐次" description={moveRecord?.item.name}>
      <label>移动到的餐次<select value={moveMealType} onChange={(event) => setMoveMealType(event.target.value as MealType)}>{mealTypes.map((type) => <option key={type} value={type}>{mealTypeLabels[type]}</option>)}</select></label>
      <button type="button" onClick={() => void confirmMove()}>确认移动</button>
    </Modal>
    <Modal open={Boolean(editingItem && editForm)} onClose={() => { setEditingItem(null); setEditForm(null); }} title={editingItem ? `编辑 ${editingItem.item.name}` : "编辑食物"}>
      {editForm && <>
        <label>编辑食物名称<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
        <label>编辑份量<input type="number" min="0" value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} /></label>
        <label>编辑单位<select value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value as "g" | "ml" })}><option value="g">g</option><option value="ml">ml</option></select></label>
        <label>编辑热量<input type="number" min="0" value={editForm.calories} onChange={(event) => setEditForm({ ...editForm, calories: event.target.value })} /></label>
        <label>编辑蛋白质<input type="number" min="0" value={editForm.protein} onChange={(event) => setEditForm({ ...editForm, protein: event.target.value })} /></label>
        <label>编辑碳水化合物<input type="number" min="0" value={editForm.carbohydrate} onChange={(event) => setEditForm({ ...editForm, carbohydrate: event.target.value })} /></label>
        <label>编辑脂肪<input type="number" min="0" value={editForm.fat} onChange={(event) => setEditForm({ ...editForm, fat: event.target.value })} /></label>
        <label>编辑状态<select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as MealStatus })}><option value="planned">计划中</option><option value="consumed">已摄入</option></select></label>
        <label>编辑餐次<select value={editForm.mealType} onChange={(event) => setEditForm({ ...editForm, mealType: event.target.value as MealType })}>{mealTypes.map((value) => <option key={value} value={value}>{mealTypeLabels[value]}</option>)}</select></label>
        <label>编辑日期<input type="date" value={editForm.date} onChange={(event) => setEditForm({ ...editForm, date: event.target.value })} /></label>
        <button type="button" onClick={() => void confirmFoodEdit()}>保存编辑</button>
      </>}
    </Modal>
    <Modal open={Boolean(traceItem)} onClose={() => setTraceItem(null)} title={traceItem ? `溯源 ${traceItem.item.name}` : "导入溯源"}>
      {traceItem?.record.audit && (
        <section role="region" aria-label={`溯源 ${traceItem.item.name}`}>
          <h3>导入溯源</h3><p>{traceItem.record.audit.rawText}</p><p>数据格式版本：{traceItem.record.audit.schemaVersion}</p><p>AI 处理时间：{traceItem.record.audit.aiProcessedAt}</p>
          <details><summary>原始 JSON</summary><pre>{traceItem.record.audit.originalJson}</pre></details>
          <button type="button" onClick={() => setTraceItem(null)}>关闭溯源</button>
        </section>
      )}
    </Modal>
    <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="已删除" description={deleteTarget?.item.name} label="删除结果">
      <p>已删除 {deleteTarget?.item.name}。如需恢复可点撤销。</p>
      <div className="form-actions">
        <button type="button" onClick={() => void undoDelete()}>撤销删除</button>
        <button type="button" onClick={() => setDeleteTarget(null)}>关闭</button>
      </div>
    </Modal>
    <section className="record-lists">
      <MealList title="已摄入" status="consumed" records={consumedRecords} onCopy={copyItem} onMove={setMoveRecord} onDelete={removeItem} onEdit={startItemEdit} onTrace={setTraceItem} reduce={reduce} />
      <MealList title="计划中" status="planned" records={plannedRecords} onCopy={copyItem} onMove={setMoveRecord} onDelete={removeItem} onEdit={startItemEdit} onTrace={setTraceItem} reduce={reduce} />
    </section>
  </section>;
}

const actionIconProps: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function CopyIcon() {
  return (
    <svg {...actionIconProps}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg {...actionIconProps}>
      <path d="M3 12h18" />
      <path d="M7 8l-4 4 4 4" />
      <path d="M17 8l4 4-4 4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg {...actionIconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TraceIcon() {
  return (
    <svg {...actionIconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg {...actionIconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </svg>
  );
}

function foodPortionLabel(item: FoodItem): string {
  const value = item.amount === null || item.amount === undefined ? "-" : `${item.amount}`;
  const unit = item.displayUnit ? displayUnitLabels[item.displayUnit] : (item.unit ?? "");
  return unit ? `${value} ${unit}` : value;
}

function MealList({ title, status, records, onCopy, onMove, onDelete, onEdit, onTrace, reduce }: {
  title: string;
  status: MealStatus;
  records: MealRecord[];
  reduce: boolean;
  onCopy: (record: MealRecord, item: FoodItem) => void;
  onMove: (value: { record: MealRecord; item: FoodItem }) => void;
  onDelete: (value: { record: MealRecord; item: FoodItem }) => void;
  onEdit: (record: MealRecord, item: FoodItem) => void;
  onTrace: (value: { record: MealRecord; item: FoodItem }) => void;
}) {
  const totalKcal = records.reduce((sum, record) => sum + record.foodItems.reduce((acc, item) => acc + item.caloriesKcal, 0), 0);
  const itemCount = records.reduce((count, record) => count + record.foodItems.length, 0);
  return (
    <section className="meal-list record-panel" data-status={status}>
      <header className="record-panel-head">
        <div className="record-panel-title">
          <span className="record-panel-dot" aria-hidden="true" />
          <h3>{title}</h3>
        </div>
        <div className="record-panel-summary">
          {itemCount > 0 && <span className="record-panel-count">{itemCount} 项</span>}
          <p className="record-panel-total">
            <span className="num">{Math.round(totalKcal)}</span>
            <span className="unit">千卡</span>
          </p>
        </div>
      </header>
      <AnimatePresence mode="popLayout">
        {records.length === 0 ? (
          <p className="meal-empty" key="empty">暂无记录</p>
        ) : records.flatMap((record) =>
          record.foodItems.map((item, index) => (
            <motion.div
              className="food-row"
              key={item.id}
              layout={reduce ? false : true}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
              transition={reduce ? { duration: 0 } : { duration: DUR.enter, delay: Math.min(index, 8) * 0.04, ease: EASE.out as unknown as number[] }}
            >
              <div className="food-info">
                <strong className="food-row-name">{item.name}</strong>
                <div className="food-row-meta">
                  <span className="food-portion">{foodPortionLabel(item)}</span>
                  <span className="source-badge">来源：{sourceText(item.dataSource)}</span>
                </div>
              </div>
              <div className="food-cal">
                <span className="num">{Math.round(item.caloriesKcal)}</span>
                <span className="unit">千卡</span>
              </div>
              <div className="food-actions">
                <button type="button" className="food-action" aria-label={`复制 ${item.name}`} title={`复制 ${item.name}`} onClick={() => onCopy(record, item)}><CopyIcon /></button>
                <button type="button" className="food-action" aria-label={`移动 ${item.name}`} title={`移动 ${item.name}`} onClick={() => onMove({ record, item })}><MoveIcon /></button>
                <button type="button" className="food-action" aria-label={`编辑 ${item.name}`} title={`编辑 ${item.name}`} onClick={() => onEdit(record, item)}><EditIcon /></button>
                {record.audit && <button type="button" className="food-action" aria-label={`查看 ${item.name} 溯源`} title={`查看 ${item.name} 溯源`} onClick={() => onTrace({ record, item })}><TraceIcon /></button>}
                <button type="button" className="food-action food-action--danger" aria-label={`删除 ${item.name}`} title={`删除 ${item.name}`} onClick={() => onDelete({ record, item })}><DeleteIcon /></button>
              </div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </section>
  );
}