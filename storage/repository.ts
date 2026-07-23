import type { PersistedRecord, StoreName } from "@/domain/types";

export type { PersistedRecord, StoreName } from "@/domain/types";

export type StoredValue<T extends object> = Omit<T, keyof PersistedRecord> & PersistedRecord;

export interface AppRepository {
  list<T extends PersistedRecord = PersistedRecord>(store: StoreName): Promise<T[]>;
  get<T extends PersistedRecord = PersistedRecord>(
    store: StoreName,
    id: string,
  ): Promise<T | undefined>;
  put<T extends object>(store: StoreName, value: T): Promise<StoredValue<T>>;
  remove(store: StoreName, id: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  transaction<T>(
    stores: readonly StoreName[],
    operation: (transaction: AppRepository) => Promise<T>,
  ): Promise<T>;
}
