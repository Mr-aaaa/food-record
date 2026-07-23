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
        await transaction.put(store, incoming);
      }
    }
  });
}

export function backupImpact(backup: AppBackup): Record<StoreName, number> {
  return Object.fromEntries(BACKUP_STORES.map((store) => [store, backup.stores[store].length])) as Record<StoreName, number>;
}
