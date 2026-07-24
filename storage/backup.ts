import type { PersistedRecord, StoreName } from "@/domain/types";
import type { AppRepository } from "@/storage/repository";

export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_STORES = [
  "profile", "settings", "targets", "meals", "bodyMetrics", "plans", "templates", "customFoods",
] as const satisfies readonly StoreName[];

export type AppBackup = {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  stores: Record<StoreName, PersistedRecord[]>;
};

export type BackupValidation =
  | { ok: true; backup: AppBackup; errors: [] }
  | { ok: false; errors: string[] };

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^((?:\d{4}-\d{2}-\d{2}))T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
  return match !== null && dateKey(match[1]);
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function dateKey(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validMeasurementTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/);
  return match !== null && dateKey(match[1]);
}

function string(value: unknown): boolean { return typeof value === "string" && value.trim().length > 0; }
function number(value: unknown, minimum = 0): boolean { return typeof value === "number" && Number.isFinite(value) && value >= minimum; }
function oneOf(value: unknown, values: readonly string[]): boolean { return typeof value === "string" && values.includes(value); }

function validateProfile(value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) { errors.push(`${path} 必须为对象。`); return; }
  if (!oneOf(record.sex, ["female", "male"])) errors.push(`${path}.sex 必须为 female 或 male。`);
  if (!Number.isInteger(record.age) || !number(record.age, 18) || Number(record.age) > 120) errors.push(`${path}.age 必须是 18 到 120 之间的整数。`);
  for (const key of ["heightCm", "weightKg"] as const) if (!number(record[key], Number.EPSILON)) errors.push(`${path}.${key} 必须为正数。`);
  if (record.goalWeightKg !== undefined && !number(record.goalWeightKg, Number.EPSILON)) errors.push(`${path}.goalWeightKg 必须为正数。`);
  if (record.activityFactor !== undefined && (!number(record.activityFactor, 1) || Number(record.activityFactor) > 2.5)) errors.push(`${path}.activityFactor 必须在 1 到 2.5 之间。`);
}

function validateNutrition(value: unknown, path: string, errors: string[], calories = false): void {
  const record = object(value);
  if (!record) { errors.push(`${path} 必须为对象。`); return; }
  const keys = calories ? ["caloriesKcal", "proteinG", "carbohydrateG", "fatG"] : ["proteinG", "carbohydrateG", "fatG"];
  for (const key of keys) if (!number(record[key])) errors.push(`${path}.${key} 必须为非负有限数值。`);
}

function validateDataSource(value: unknown, path: string, errors: string[], required: boolean): void {
  if (value === undefined && !required) return;
  const record = object(value);
  if (!record) { errors.push(`${path} 必须为对象。`); return; }
  if (!oneOf(record.type, ["user_custom", "builtin_database", "third_party_database", "ai_estimated", "user_manual"])) errors.push(`${path}.type 无效。`);
  if (!string(record.name)) errors.push(`${path}.name 必须为非空字符串。`);
  if (!number(record.confidence) || Number(record.confidence) > 1) errors.push(`${path}.confidence 必须在 0 到 1 之间。`);
  if (typeof record.isEstimated !== "boolean") errors.push(`${path}.isEstimated 必须为布尔值。`);
}

function validateMeal(value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) { errors.push(`${path} 必须为对象。`); return; }
  if (!dateKey(record.date)) errors.push(`${path}.date 必须为有效的日历日期。`);
  if (!oneOf(record.mealType, ["breakfast", "lunch", "dinner", "snack"])) errors.push(`${path}.mealType 无效。`);
  if (!oneOf(record.status, ["planned", "consumed"])) errors.push(`${path}.status 无效。`);
  if (!Array.isArray(record.foodItems) || record.foodItems.length === 0) { errors.push(`${path}.foodItems 必须为非空数组。`); return; }
  record.foodItems.forEach((item, index) => {
    const food = object(item); const itemPath = `${path}.foodItems[${index}]`;
    if (!food) { errors.push(`${itemPath} 必须为对象。`); return; }
    if (!string(food.id) || !string(food.name) || !number(food.caloriesKcal)) errors.push(`${itemPath} 的标识或热量无效。`);
    validateNutrition(food.nutrition, `${itemPath}.nutrition`, errors);
    if (food.amount !== undefined && !number(food.amount, Number.EPSILON)) errors.push(`${itemPath}.amount 必须为正数。`);
    if (food.unit !== undefined && !oneOf(food.unit, ["g", "ml"])) errors.push(`${itemPath}.unit 无效。`);
    if (food.displayUnit !== undefined && !oneOf(food.displayUnit, ["g", "ml", "bowl", "serving", "spoon", "piece"])) errors.push(`${itemPath}.displayUnit 无效。`);
    if (food.gramsPerDisplayUnit !== undefined && !number(food.gramsPerDisplayUnit, Number.EPSILON)) errors.push(`${itemPath}.gramsPerDisplayUnit 必须为正数。`);
    validateDataSource(food.dataSource, `${itemPath}.dataSource`, errors, false);
  });
  if (record.audit !== undefined) {
    const audit = object(record.audit);
    if (!audit) errors.push(`${path}.audit 必须为对象。`);
    else {
      if (typeof audit.rawText !== "string") errors.push(`${path}.audit.rawText 必须为字符串。`);
      if (typeof audit.originalJson !== "string") errors.push(`${path}.audit.originalJson 必须为字符串。`);
      if (!string(audit.schemaVersion)) errors.push(`${path}.audit.schemaVersion 必须非空。`);
      if (!Array.isArray(audit.warnings) || !audit.warnings.every((warning) => typeof warning === "string")) errors.push(`${path}.audit.warnings 必须为字符串。`);
      if (audit.source !== "external_ai") errors.push(`${path}.audit.source 必须为 external_ai。`);
      if (!validTimestamp(audit.aiProcessedAt)) errors.push(`${path}.audit.aiProcessedAt 必须为有效的 ISO 时间戳。`);
      const normalized = object(audit.normalizedDraft);
      if (!normalized || normalized.schemaVersion !== audit.schemaVersion || normalized.rawText !== audit.rawText) {
        errors.push(`${path}.audit.normalizedDraft 必须保留 schemaVersion 和 rawText。`);
      }
    }
  }
}

function validateStoreRecord(store: StoreName, value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) return;
  switch (store) {
    case "profile": validateProfile(record, path, errors); break;
    case "settings": if (record.id !== "onboarding" || !string(record.planId)) errors.push(`${path} 必须包含引导设置。`); break;
    case "targets": {
      if (!dateKey(record.calculationDate) || !string(record.planId)) errors.push(`${path} 的计算日期或计划 ID 无效。`);
      validateProfile(record.sourceProfile, `${path}.sourceProfile`, errors);
      const target = object(record.target);
      if (!target) errors.push(`${path}.target 必须为对象。`);
      else {
        for (const key of ["bmrKcal", "tdeeKcal", "targetCaloriesKcal", "deficitRatio"] as const) if (!number(target[key])) errors.push(`${path}.target.${key} 必须为非负数。`);
        if (Array.isArray(target.warnings) === false || !target.warnings.every(string)) errors.push(`${path}.target.warnings 必须为字符串。`);
        if (typeof target.requiresManualReview !== "boolean") errors.push(`${path}.target.requiresManualReview 必须为布尔值。`);
      }
      validateNutrition(record.macroTargets, `${path}.macroTargets`, errors);
      if (record.calculation !== undefined) {
        const calculation = object(record.calculation);
        if (!calculation || calculation.formula !== "Mifflin-St Jeor" || !number(calculation.activityFactor, 1) || !number(calculation.requestedDeficitRatio) || !validTimestamp(calculation.createdAt) || typeof calculation.manuallyEdited !== "boolean") {
          errors.push(`${path}.calculation 的审计字段无效。`);
        }
      }
      break;
    }
    case "meals": validateMeal(record, path, errors); break;
    case "bodyMetrics": {
      if (!validMeasurementTimestamp(record.measuredAt)) errors.push(`${path}.measuredAt 必须是有效的日历 ISO 时间戳。`);
      if (typeof record.fasting !== "boolean") errors.push(`${path}.fasting 必须为布尔值。`);
      if (record.weightKg !== undefined && !number(record.weightKg, Number.EPSILON)) errors.push(`${path}.weightKg 必须为正数。`);
      if (record.waistCm !== undefined && !number(record.waistCm, Number.EPSILON)) errors.push(`${path}.waistCm 必须为正数。`);
      if (record.weightKg === undefined && record.waistCm === undefined) errors.push(`${path} 需要包含 weightKg 或 waistCm。`);
      if (record.notes !== undefined && typeof record.notes !== "string") errors.push(`${path}.notes 必须为字符串。`); break;
    }
    case "plans": {
      if (!string(record.name) || !string(record.description) || !number(record.proteinGPerKg) || !number(record.fatGPerKg) || !oneOf(record.sourceType, ["system", "external", "custom"])) errors.push(`${path} 的计划字段无效。`);
      if (record.sourceName !== undefined && !string(record.sourceName)) errors.push(`${path}.sourceName 必须非空。`);
      if (record.sourceUrl !== undefined && (typeof record.sourceUrl !== "string" || !/^https?:\/\//.test(record.sourceUrl))) errors.push(`${path}.sourceUrl 必须为 http(s) 链接。`);
      if (record.sourceLink !== undefined && (typeof record.sourceLink !== "string" || !/^https?:\/\//.test(record.sourceLink))) errors.push(`${path}.sourceLink 必须为 http(s) 链接。`);
      if (record.sourceDate !== undefined && !dateKey(record.sourceDate)) errors.push(`${path}.sourceDate 必须为有效的日历日期。`);
      if (record.sourceVerified !== undefined && typeof record.sourceVerified !== "boolean") errors.push(`${path}.sourceVerified 必须为布尔值。`);
      if (record.disclaimer !== undefined && !string(record.disclaimer)) errors.push(`${path}.disclaimer 必须非空。`);
      if (record.isEstimated !== undefined && typeof record.isEstimated !== "boolean") errors.push(`${path}.isEstimated 必须为布尔值。`);
      if (record.requiresUserConfirmation !== undefined && typeof record.requiresUserConfirmation !== "boolean") errors.push(`${path}.requiresUserConfirmation 必须为布尔值。`); break;
    }
    case "templates": {
      if (!string(record.name) || !oneOf(record.kind, ["meal", "day"]) || !dateKey(record.createdOn) || !Array.isArray(record.records) || record.records.length === 0) errors.push(`${path} 的模板字段无效。`);
      else record.records.forEach((meal, index) => validateMeal(meal, `${path}.records[${index}]`, errors)); break;
    }
    case "customFoods": {
      if (!string(record.name) || !oneOf(record.servingUnit, ["g", "ml"])) errors.push(`${path} 的自定义食物字段无效。`);
      validateNutrition(record.nutritionPer100, `${path}.nutritionPer100`, errors, true);
      validateDataSource(record.dataSource, `${path}.dataSource`, errors, true);
      if (record.active !== undefined && typeof record.active !== "boolean") errors.push(`${path}.active 必须为布尔值。`);
      if (record.displayUnits !== undefined) {
        if (!Array.isArray(record.displayUnits)) errors.push(`${path}.displayUnits 必须为数组。`);
        else record.displayUnits.forEach((conversion, index) => {
          const item = object(conversion);
          if (!item || !oneOf(item.unit, ["bowl", "serving", "spoon", "piece"]) || !number(item.gramsOrMl, Number.EPSILON)) {
            errors.push(`${path}.displayUnits[${index}] 无效。`);
          }
        });
      }
      break;
    }
  }
}

function validateBackupValue(value: unknown): BackupValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["备份必须是 JSON 对象。"] };
  const backup = value as Partial<AppBackup>;
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push(`不支持的备份架构版本：${String(backup.schemaVersion)}。`);
  if (typeof backup.appVersion !== "string" || !backup.appVersion.trim()) errors.push("备份的 appVersion 必须为非空字符串。");
  if (!validTimestamp(backup.exportedAt)) errors.push("备份的 exportedAt 必须为有效的 ISO 时间戳。");
  if (!backup.stores || typeof backup.stores !== "object" || Array.isArray(backup.stores)) errors.push("备份的 stores 必须为对象。");

  if (backup.stores && typeof backup.stores === "object" && !Array.isArray(backup.stores)) {
    const supplied = Object.keys(backup.stores);
    for (const store of BACKUP_STORES) {
      const records = (backup.stores as Partial<Record<StoreName, unknown>>)[store];
      if (!Array.isArray(records)) { errors.push(`stores.${store} 必须为数组。`); continue; }
      records.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) { errors.push(`stores.${store}[${index}] 必须为对象。`); return; }
        const persisted = record as Partial<PersistedRecord>;
        if (typeof persisted.id !== "string" || !persisted.id.trim()) errors.push(`stores.${store}[${index}].id 必须为非空字符串。`);
        if (!validTimestamp(persisted.createdAt)) errors.push(`stores.${store}[${index}].createdAt 必须为有效的 ISO 时间戳。`);
        if (!validTimestamp(persisted.updatedAt)) errors.push(`stores.${store}[${index}].updatedAt 必须为有效的 ISO 时间戳。`);
        validateStoreRecord(store, record, `stores.${store}[${index}]`, errors);
      });
    }
    for (const name of supplied) if (!BACKUP_STORES.includes(name as StoreName)) errors.push(`stores.${name} 不受支持。`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, backup: backup as AppBackup, errors: [] };
}

export function validateBackup(text: string): BackupValidation {
  if (typeof text !== "string" || !text.trim()) return { ok: false, errors: ["请选择非空备份文件。"] };
  try { return validateBackupValue(JSON.parse(text)); }
  catch { return { ok: false, errors: ["备份文件不是有效的 JSON。"] }; }
}

export async function exportAll(repository: AppRepository, appVersion: string): Promise<AppBackup> {
  return repository.transaction(BACKUP_STORES, async (transaction) => {
    const entries = await Promise.all(BACKUP_STORES.map(async (store) => [store, await transaction.list(store)] as const));
    return { schemaVersion: BACKUP_SCHEMA_VERSION, appVersion, exportedAt: new Date().toISOString(), stores: Object.fromEntries(entries) as AppBackup["stores"] };
  }, "readonly");
}

export async function restoreBackup(repository: AppRepository, input: AppBackup, mode: "merge" | "replace"): Promise<void> {
  const validation = validateBackupValue(input);
  if (!validation.ok) throw new Error(`备份无效：${validation.errors.join(" ")}`);
  if (mode !== "merge" && mode !== "replace") throw new Error("恢复模式必须是 merge 或 replace。");
  const backup = validation.backup;

  await repository.transaction(BACKUP_STORES, async (transaction) => {
    if (mode === "replace") for (const store of BACKUP_STORES) await transaction.clear(store);
    for (const store of BACKUP_STORES) {
      for (const incoming of backup.stores[store]) {
        if (mode === "merge") {
          const current = await transaction.get(store, incoming.id);
          if (current && Date.parse(current.updatedAt) >= Date.parse(incoming.updatedAt)) continue;
        }
        await transaction.putExact(store, incoming);
      }
    }
  });
}

export function backupImpact(backup: AppBackup): Record<StoreName, number> {
  return Object.fromEntries(BACKUP_STORES.map((store) => [store, backup.stores[store].length])) as Record<StoreName, number>;
}
