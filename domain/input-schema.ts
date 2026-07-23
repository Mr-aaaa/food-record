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

  const type = DATA_SOURCE_TYPES.find((candidate) => candidate === value.type);
  const name = isNonEmptyString(value.name) ? value.name : undefined;
  const confidence = isFiniteNumber(value.confidence) ? value.confidence : undefined;
  const isEstimated = typeof value.isEstimated === "boolean" ? value.isEstimated : undefined;

  if (type === undefined) {
    addIssue(issues, `${path}.type`, "是不支持的数据来源类型");
  }
  if (name === undefined) {
    addIssue(issues, `${path}.name`, "不能为空");
  }
  if (confidence === undefined || confidence < 0 || confidence > 1) {
    addIssue(issues, `${path}.confidence`, "必须是 0 到 1 之间的有限数值");
  }
  if (isEstimated === undefined) {
    addIssue(issues, `${path}.isEstimated`, "必须是布尔值");
  }
  if (type === "ai_estimated" && isEstimated !== true) {
    addIssue(issues, `${path}.isEstimated`, "ai_estimated 必须标记为估算值");
  }

  if (
    type === undefined ||
    name === undefined ||
    confidence === undefined ||
    confidence < 0 ||
    confidence > 1 ||
    isEstimated === undefined ||
    (type === "ai_estimated" && isEstimated !== true)
  ) {
    return undefined;
  }

  return { type, name, confidence, isEstimated };
}

function readItem(value: unknown, index: number, issues: ValidationIssue[]): MealDraftItem | undefined {
  const path = `items[${index}]`;
  if (!isObject(value)) {
    addIssue(issues, path, "必须是食物项目对象");
    return undefined;
  }

  const itemId = isNonEmptyString(value.itemId) ? value.itemId : undefined;
  const foodId = isNonEmptyString(value.foodId) ? value.foodId : undefined;
  const name = isNonEmptyString(value.name) ? value.name : undefined;
  const amount = value.amount === null ? null : isFiniteNumber(value.amount) ? value.amount : undefined;
  const unit = UNITS.find((candidate) => candidate === value.unit);
  const isAmbiguous = typeof value.isAmbiguous === "boolean" ? value.isAmbiguous : undefined;

  if (itemId === undefined) {
    addIssue(issues, `${path}.itemId`, "不能为空");
  }
  if (foodId === undefined) {
    addIssue(issues, `${path}.foodId`, "不能为空");
  }
  if (name === undefined) {
    addIssue(issues, `${path}.name`, "不能为空");
  }
  if (amount === undefined || (amount !== null && amount < 0)) {
    addIssue(issues, `${path}.amount`, "必须是大于或等于 0 的有限数值或 null");
  }
  if (unit === undefined) {
    addIssue(issues, `${path}.unit`, "只支持 g 或 ml");
  }
  if (isAmbiguous === undefined) {
    addIssue(issues, `${path}.isAmbiguous`, "must be a boolean");
  }

  const nutrition = readNutrition(value.nutrition, `${path}.nutrition`, issues);
  const dataSource = readDataSource(value.dataSource, `${path}.dataSource`, issues);

  if (
    itemId === undefined ||
    foodId === undefined ||
    name === undefined ||
    amount === undefined ||
    (amount !== null && amount < 0) ||
    unit === undefined ||
    isAmbiguous === undefined ||
    nutrition === undefined ||
    dataSource === undefined
  ) {
    return undefined;
  }

  return { itemId, foodId, name, amount, unit, isAmbiguous, nutrition, dataSource };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isOffsetIsoTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  );

  return match !== null && isIsoDate(match[1]);
}

function areNonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function areMealDraftItems(value: Array<MealDraftItem | undefined>): value is MealDraftItem[] {
  return value.every((item): item is MealDraftItem => item !== undefined);
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
      isAmbiguous: item.isAmbiguous,
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

  const schemaVersion = parsed.schemaVersion === SUPPORTED_SCHEMA_VERSION
    ? SUPPORTED_SCHEMA_VERSION
    : undefined;
  const recordId = isNonEmptyString(parsed.recordId) ? parsed.recordId : undefined;
  const date = isNonEmptyString(parsed.date) && isIsoDate(parsed.date.trim())
    ? parsed.date.trim()
    : undefined;
  const mealType = MEAL_TYPES.find((candidate) => candidate === parsed.mealType);
  const status = MEAL_STATUSES.find((candidate) => candidate === parsed.status);
  const rawText = isNonEmptyString(parsed.rawText) ? parsed.rawText : undefined;
  const warnings = areNonEmptyStrings(parsed.warnings) ? parsed.warnings : undefined;
  const createdAt = isNonEmptyString(parsed.createdAt) && isOffsetIsoTimestamp(parsed.createdAt.trim())
    ? parsed.createdAt.trim()
    : undefined;
  const updatedAt = isNonEmptyString(parsed.updatedAt) && isOffsetIsoTimestamp(parsed.updatedAt.trim())
    ? parsed.updatedAt.trim()
    : undefined;
  const itemCandidates = Array.isArray(parsed.items)
    ? parsed.items.map((item, index) => readItem(item, index, issues))
    : undefined;
  const items = itemCandidates !== undefined && itemCandidates.length > 0 && areMealDraftItems(itemCandidates)
    ? itemCandidates
    : undefined;

  if (schemaVersion === undefined) {
    addIssue(issues, "schemaVersion", `只支持 schemaVersion ${SUPPORTED_SCHEMA_VERSION}`);
  }
  if (recordId === undefined) {
    addIssue(issues, "recordId", "不能为空");
  }
  if (date === undefined) {
    addIssue(issues, "date", "必须是 YYYY-MM-DD 日期");
  }
  if (mealType === undefined) {
    addIssue(issues, "mealType", "是不支持的餐次类型");
  }
  if (status === undefined) {
    addIssue(issues, "status", "是不支持的餐次状态");
  }
  if (rawText === undefined) {
    addIssue(issues, "rawText", "不能为空");
  }
  if (items === undefined) {
    addIssue(issues, "items", "必须包含至少一个食物项目");
  }
  if (warnings === undefined) {
    addIssue(issues, "warnings", "必须是非空提示文本数组");
  }
  if (createdAt === undefined) {
    addIssue(issues, "createdAt", "必须是带时区的 ISO 8601 时间");
  }
  if (updatedAt === undefined) {
    addIssue(issues, "updatedAt", "必须是带时区的 ISO 8601 时间");
  }

  if (
    schemaVersion === undefined ||
    recordId === undefined ||
    date === undefined ||
    mealType === undefined ||
    status === undefined ||
    rawText === undefined ||
    items === undefined ||
    warnings === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    issues.length > 0
  ) {
    return { ok: false, canConfirm: false, cleanedText, issues };
  }

  const draft = normalizeMealDraft({
    schemaVersion,
    recordId,
    date,
    mealType,
    status,
    rawText,
    items,
    warnings,
    createdAt,
    updatedAt,
  });
  const incompleteIssues = draft.items.flatMap((item, index) =>
    item.amount === null
      ? [{ path: `items[${index}].amount`, message: "需要补充份量" }]
      : item.isAmbiguous
        ? [{ path: `items[${index}].isAmbiguous`, message: "food needs confirmation" }]
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
