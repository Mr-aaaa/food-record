import type {
  MealDataSource,
  MealDataSourceType,
  MealDraft,
  MealDraftItem,
  MealStatus,
  MealType,
  NutritionTotals,
  ValidationIssue,
  ValidationResult,
} from "@/domain/types";

const SUPPORTED_SCHEMA_VERSION = "1.0";
const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_STATUSES: readonly MealStatus[] = ["planned", "consumed"];
const DATA_SOURCE_TYPES: readonly MealDataSourceType[] = [
  "user_custom",
  "builtin_database",
  "third_party_database",
  "ai_estimated",
  "user_manual",
];
const UNITS = ["g", "ml"] as const;

type JsonObject = Record<string, unknown>;

function cleanJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i);

  return (fenced?.[1] ?? trimmed).trim();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function readNutrition(value: unknown, path: string, issues: ValidationIssue[]): NutritionTotals | undefined {
  if (!isObject(value)) {
    addIssue(issues, path, "必须是营养数值对象");
    return undefined;
  }

  const fields = ["caloriesKcal", "proteinG", "fatG", "carbohydrateG"] as const;
  let valid = true;
  for (const field of fields) {
    const fieldValue = value[field];
    if (!isFiniteNumber(fieldValue) || fieldValue < 0) {
      addIssue(issues, `${path}.${field}`, "必须是大于或等于 0 的有限数值");
      valid = false;
    }
  }

  if (!valid) {
    return undefined;
  }

  return {
    caloriesKcal: value.caloriesKcal as number,
    proteinG: value.proteinG as number,
    fatG: value.fatG as number,
    carbohydrateG: value.carbohydrateG as number,
  };
}

function readDataSource(value: unknown, path: string, issues: ValidationIssue[]): MealDataSource | undefined {
  if (!isObject(value)) {
    addIssue(issues, path, "必须是数据来源对象");
    return undefined;
  }

  let valid = true;
  if (!isNonEmptyString(value.type) || !DATA_SOURCE_TYPES.includes(value.type as MealDataSourceType)) {
    addIssue(issues, `${path}.type`, "是不支持的数据来源类型");
    valid = false;
  }
  if (!isNonEmptyString(value.name)) {
    addIssue(issues, `${path}.name`, "不能为空");
    valid = false;
  }
  if (!isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    addIssue(issues, `${path}.confidence`, "必须是 0 到 1 之间的有限数值");
    valid = false;
  }
  if (typeof value.isEstimated !== "boolean") {
    addIssue(issues, `${path}.isEstimated`, "必须是布尔值");
    valid = false;
  }
  if (value.type === "ai_estimated" && value.isEstimated !== true) {
    addIssue(issues, `${path}.isEstimated`, "ai_estimated 必须标记为估算值");
    valid = false;
  }

  if (!valid) {
    return undefined;
  }

  return {
    type: value.type as MealDataSourceType,
    name: value.name,
    confidence: value.confidence,
    isEstimated: value.isEstimated,
  };
}

function readItem(value: unknown, index: number, issues: ValidationIssue[]): MealDraftItem | undefined {
  const path = `items[${index}]`;
  if (!isObject(value)) {
    addIssue(issues, path, "必须是食物项目对象");
    return undefined;
  }

  let valid = true;
  for (const field of ["itemId", "foodId", "name"] as const) {
    if (!isNonEmptyString(value[field])) {
      addIssue(issues, `${path}.${field}`, "不能为空");
      valid = false;
    }
  }

  const amount = value.amount;
  if (amount !== null && (!isFiniteNumber(amount) || amount < 0)) {
    addIssue(issues, `${path}.amount`, "必须是大于或等于 0 的有限数值或 null");
    valid = false;
  }
  if (!isNonEmptyString(value.unit) || !UNITS.includes(value.unit as (typeof UNITS)[number])) {
    addIssue(issues, `${path}.unit`, "只支持 g 或 ml");
    valid = false;
  }

  const nutrition = readNutrition(value.nutrition, `${path}.nutrition`, issues);
  const dataSource = readDataSource(value.dataSource, `${path}.dataSource`, issues);
  valid = valid && nutrition !== undefined && dataSource !== undefined;

  if (!valid) {
    return undefined;
  }

  return {
    itemId: value.itemId,
    foodId: value.foodId,
    name: value.name,
    amount,
    unit: value.unit as MealDraftItem["unit"],
    nutrition,
    dataSource,
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isOffsetIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function normalizeMealDraft(draft: MealDraft): MealDraft {
  return {
    ...draft,
    schemaVersion: draft.schemaVersion.trim(),
    recordId: draft.recordId.trim(),
    date: draft.date.trim(),
    rawText: draft.rawText.trim(),
    warnings: draft.warnings.map((warning) => warning.trim()),
    createdAt: draft.createdAt.trim(),
    updatedAt: draft.updatedAt.trim(),
    items: draft.items.map((item) => ({
      ...item,
      itemId: item.itemId.trim(),
      foodId: item.foodId.trim(),
      name: item.name.trim(),
      unit: item.unit.trim() as MealDraftItem["unit"],
      nutrition: { ...item.nutrition },
      dataSource: { ...item.dataSource, name: item.dataSource.name.trim() },
    })),
  };
}

export function parseImportedMeal(text: string): ValidationResult<MealDraft> {
  const cleanedText = cleanJsonText(text);
  const issues: ValidationIssue[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    return { ok: false, canConfirm: false, cleanedText, issues: [{ path: "$", message: "不是合法 JSON" }] };
  }

  if (!isObject(parsed)) {
    return { ok: false, canConfirm: false, cleanedText, issues: [{ path: "$", message: "必须是 JSON 对象" }] };
  }

  let valid = true;
  if (parsed.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    addIssue(issues, "schemaVersion", `只支持 schemaVersion ${SUPPORTED_SCHEMA_VERSION}`);
    valid = false;
  }
  if (!isNonEmptyString(parsed.recordId)) {
    addIssue(issues, "recordId", "不能为空");
    valid = false;
  }
  if (!isNonEmptyString(parsed.date) || !isIsoDate(parsed.date.trim())) {
    addIssue(issues, "date", "必须是 YYYY-MM-DD 日期");
    valid = false;
  }
  if (!isNonEmptyString(parsed.mealType) || !MEAL_TYPES.includes(parsed.mealType as MealType)) {
    addIssue(issues, "mealType", "是不支持的餐次类型");
    valid = false;
  }
  if (!isNonEmptyString(parsed.status) || !MEAL_STATUSES.includes(parsed.status as MealStatus)) {
    addIssue(issues, "status", "是不支持的餐次状态");
    valid = false;
  }
  if (!isNonEmptyString(parsed.rawText)) {
    addIssue(issues, "rawText", "不能为空");
    valid = false;
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    addIssue(issues, "items", "必须包含至少一个食物项目");
    valid = false;
  }
  if (!Array.isArray(parsed.warnings) || parsed.warnings.some((warning) => !isNonEmptyString(warning))) {
    addIssue(issues, "warnings", "必须是非空提示文本数组");
    valid = false;
  }
  if (!isNonEmptyString(parsed.createdAt) || !isOffsetIsoTimestamp(parsed.createdAt.trim())) {
    addIssue(issues, "createdAt", "必须是带时区的 ISO 8601 时间");
    valid = false;
  }
  if (!isNonEmptyString(parsed.updatedAt) || !isOffsetIsoTimestamp(parsed.updatedAt.trim())) {
    addIssue(issues, "updatedAt", "必须是带时区的 ISO 8601 时间");
    valid = false;
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item, index) => readItem(item, index, issues))
    : [];
  if (items.some((item) => item === undefined)) {
    valid = false;
  }

  if (!valid || issues.length > 0) {
    return { ok: false, canConfirm: false, cleanedText, issues };
  }

  const draft = normalizeMealDraft({
    schemaVersion: parsed.schemaVersion,
    recordId: parsed.recordId,
    date: parsed.date,
    mealType: parsed.mealType as MealType,
    status: parsed.status as MealStatus,
    rawText: parsed.rawText,
    items: items as MealDraftItem[],
    warnings: parsed.warnings as string[],
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  });
  const incompleteIssues = draft.items.flatMap((item, index) =>
    item.amount === null
      ? [{ path: `items[${index}].amount`, message: "需要补充份量" }]
      : [],
  );

  return {
    ok: true,
    canConfirm: incompleteIssues.length === 0,
    cleanedText,
    value: draft,
    issues: incompleteIssues,
  };
}
