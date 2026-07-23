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
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
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

function string(value: unknown): boolean { return typeof value === "string" && value.trim().length > 0; }
function number(value: unknown, minimum = 0): boolean { return typeof value === "number" && Number.isFinite(value) && value >= minimum; }
function oneOf(value: unknown, values: readonly string[]): boolean { return typeof value === "string" && values.includes(value); }

function validateProfile(value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) { errors.push(`${path} must be an object.`); return; }
  if (!oneOf(record.sex, ["female", "male"])) errors.push(`${path}.sex must be female or male.`);
  if (!Number.isInteger(record.age) || !number(record.age, 18)) errors.push(`${path}.age must be an adult age.`);
  for (const key of ["heightCm", "weightKg"] as const) if (!number(record[key], Number.EPSILON)) errors.push(`${path}.${key} must be a positive number.`);
  if (record.goalWeightKg !== undefined && !number(record.goalWeightKg, Number.EPSILON)) errors.push(`${path}.goalWeightKg must be a positive number.`);
}

function validateNutrition(value: unknown, path: string, errors: string[], calories = false): void {
  const record = object(value);
  if (!record) { errors.push(`${path} must be an object.`); return; }
  const keys = calories ? ["caloriesKcal", "proteinG", "carbohydrateG", "fatG"] : ["proteinG", "carbohydrateG", "fatG"];
  for (const key of keys) if (!number(record[key])) errors.push(`${path}.${key} must be a non-negative finite number.`);
}

function validateDataSource(value: unknown, path: string, errors: string[], required: boolean): void {
  if (value === undefined && !required) return;
  const record = object(value);
  if (!record) { errors.push(`${path} must be an object.`); return; }
  if (!oneOf(record.type, ["user_custom", "builtin_database", "third_party_database", "ai_estimated", "user_manual"])) errors.push(`${path}.type is invalid.`);
  if (!string(record.name)) errors.push(`${path}.name must be a non-empty string.`);
  if (!number(record.confidence) || Number(record.confidence) > 1) errors.push(`${path}.confidence must be between 0 and 1.`);
  if (typeof record.isEstimated !== "boolean") errors.push(`${path}.isEstimated must be boolean.`);
}

function validateMeal(value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) { errors.push(`${path} must be an object.`); return; }
  if (!dateKey(record.date)) errors.push(`${path}.date must be a calendar date.`);
  if (!oneOf(record.mealType, ["breakfast", "lunch", "dinner", "snack"])) errors.push(`${path}.mealType is invalid.`);
  if (!oneOf(record.status, ["planned", "consumed"])) errors.push(`${path}.status is invalid.`);
  if (!Array.isArray(record.foodItems) || record.foodItems.length === 0) { errors.push(`${path}.foodItems must be a non-empty array.`); return; }
  record.foodItems.forEach((item, index) => {
    const food = object(item); const itemPath = `${path}.foodItems[${index}]`;
    if (!food) { errors.push(`${itemPath} must be an object.`); return; }
    if (!string(food.id) || !string(food.name) || !number(food.caloriesKcal)) errors.push(`${itemPath} has invalid identity or calories.`);
    validateNutrition(food.nutrition, `${itemPath}.nutrition`, errors);
    if (food.amount !== undefined && !number(food.amount, Number.EPSILON)) errors.push(`${itemPath}.amount must be a positive number.`);
    if (food.unit !== undefined && !oneOf(food.unit, ["g", "ml"])) errors.push(`${itemPath}.unit is invalid.`);
    validateDataSource(food.dataSource, `${itemPath}.dataSource`, errors, false);
  });
}

function validateStoreRecord(store: StoreName, value: unknown, path: string, errors: string[]): void {
  const record = object(value);
  if (!record) return;
  switch (store) {
    case "profile": validateProfile(record, path, errors); break;
    case "settings": if (record.id !== "onboarding" || !string(record.planId)) errors.push(`${path} must contain onboarding settings.`); break;
    case "targets": {
      if (!dateKey(record.calculationDate) || !string(record.planId)) errors.push(`${path} has invalid calculation date or plan id.`);
      validateProfile(record.sourceProfile, `${path}.sourceProfile`, errors);
      const target = object(record.target);
      if (!target) errors.push(`${path}.target must be an object.`);
      else {
        for (const key of ["bmrKcal", "tdeeKcal", "targetCaloriesKcal", "deficitRatio"] as const) if (!number(target[key])) errors.push(`${path}.target.${key} must be non-negative.`);
        if (Array.isArray(target.warnings) === false || !target.warnings.every(string)) errors.push(`${path}.target.warnings must be strings.`);
        if (typeof target.requiresManualReview !== "boolean") errors.push(`${path}.target.requiresManualReview must be boolean.`);
      }
      validateNutrition(record.macroTargets, `${path}.macroTargets`, errors); break;
    }
    case "meals": validateMeal(record, path, errors); break;
    case "bodyMetrics": {
      if (!validTimestamp(record.measuredAt)) errors.push(`${path}.measuredAt must be a timestamp.`);
      if (typeof record.fasting !== "boolean") errors.push(`${path}.fasting must be boolean.`);
      if (record.weightKg !== undefined && !number(record.weightKg, Number.EPSILON)) errors.push(`${path}.weightKg must be positive.`);
      if (record.waistCm !== undefined && !number(record.waistCm, Number.EPSILON)) errors.push(`${path}.waistCm must be positive.`);
      if (record.weightKg === undefined && record.waistCm === undefined) errors.push(`${path} requires weightKg or waistCm.`);
      if (record.notes !== undefined && typeof record.notes !== "string") errors.push(`${path}.notes must be a string.`); break;
    }
    case "plans": {
      if (!string(record.name) || !string(record.description) || !number(record.proteinGPerKg) || !number(record.fatGPerKg) || !oneOf(record.sourceType, ["system", "external", "custom"])) errors.push(`${path} has invalid plan fields.`);
      if (record.sourceName !== undefined && !string(record.sourceName)) errors.push(`${path}.sourceName must be non-empty.`);
      if (record.sourceUrl !== undefined && (typeof record.sourceUrl !== "string" || !/^https?:\/\//.test(record.sourceUrl))) errors.push(`${path}.sourceUrl must be http(s).`);
      if (record.sourceDate !== undefined && !dateKey(record.sourceDate)) errors.push(`${path}.sourceDate must be a calendar date.`); break;
    }
    case "templates": {
      if (!string(record.name) || !oneOf(record.kind, ["meal", "day"]) || !dateKey(record.createdOn) || !Array.isArray(record.records) || record.records.length === 0) errors.push(`${path} has invalid template fields.`);
      else record.records.forEach((meal, index) => validateMeal(meal, `${path}.records[${index}]`, errors)); break;
    }
    case "customFoods": {
      if (!string(record.name) || !oneOf(record.servingUnit, ["g", "ml"])) errors.push(`${path} has invalid custom food fields.`);
      validateNutrition(record.nutritionPer100, `${path}.nutritionPer100`, errors, true);
      validateDataSource(record.dataSource, `${path}.dataSource`, errors, true); break;
    }
  }
}

function validateBackupValue(value: unknown): BackupValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["Backup must be a JSON object."] };
  const backup = value as Partial<AppBackup>;
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push(`Unsupported backup schema version: ${String(backup.schemaVersion)}.`);
  if (typeof backup.appVersion !== "string" || !backup.appVersion.trim()) errors.push("Backup appVersion must be a non-empty string.");
  if (!validTimestamp(backup.exportedAt)) errors.push("Backup exportedAt must be a valid ISO timestamp.");
  if (!backup.stores || typeof backup.stores !== "object" || Array.isArray(backup.stores)) errors.push("Backup stores must be an object.");

  if (backup.stores && typeof backup.stores === "object" && !Array.isArray(backup.stores)) {
    const supplied = Object.keys(backup.stores);
    for (const store of BACKUP_STORES) {
      const records = (backup.stores as Partial<Record<StoreName, unknown>>)[store];
      if (!Array.isArray(records)) { errors.push(`stores.${store} must be an array.`); continue; }
      records.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) { errors.push(`stores.${store}[${index}] must be an object.`); return; }
        const persisted = record as Partial<PersistedRecord>;
        if (typeof persisted.id !== "string" || !persisted.id.trim()) errors.push(`stores.${store}[${index}].id must be a non-empty string.`);
        if (!validTimestamp(persisted.createdAt)) errors.push(`stores.${store}[${index}].createdAt must be a valid ISO timestamp.`);
        if (!validTimestamp(persisted.updatedAt)) errors.push(`stores.${store}[${index}].updatedAt must be a valid ISO timestamp.`);
        validateStoreRecord(store, record, `stores.${store}[${index}]`, errors);
      });
    }
    for (const name of supplied) if (!BACKUP_STORES.includes(name as StoreName)) errors.push(`stores.${name} is not supported.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, backup: backup as AppBackup, errors: [] };
}

export function validateBackup(text: string): BackupValidation {
  if (typeof text !== "string" || !text.trim()) return { ok: false, errors: ["Choose a non-empty backup file."] };
  try { return validateBackupValue(JSON.parse(text)); }
  catch { return { ok: false, errors: ["The backup file is not valid JSON."] }; }
}

export async function exportAll(repository: AppRepository, appVersion: string): Promise<AppBackup> {
  const entries = await Promise.all(BACKUP_STORES.map(async (store) => [store, await repository.list(store)] as const));
  return { schemaVersion: BACKUP_SCHEMA_VERSION, appVersion, exportedAt: new Date().toISOString(), stores: Object.fromEntries(entries) as AppBackup["stores"] };
}

export async function restoreBackup(repository: AppRepository, input: AppBackup, mode: "merge" | "replace"): Promise<void> {
  const validation = validateBackupValue(input);
  if (!validation.ok) throw new Error(`Invalid backup: ${validation.errors.join(" ")}`);
  if (mode !== "merge" && mode !== "replace") throw new Error("Restore mode must be merge or replace.");
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
