import type { PersistedRecord, StoreName } from "@/domain/types";
import type { AppRepository, StoredValue } from "@/storage/repository";

const DATABASE_VERSION = 1;
const STORE_NAMES: readonly StoreName[] = [
  "profile",
  "settings",
  "targets",
  "meals",
  "bodyMetrics",
  "plans",
  "templates",
  "customFoods",
];

type RecordValue = Record<string, unknown> & Partial<PersistedRecord>;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = globalThis.indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
  });
}

function makeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nextUpdatedAt(previous?: string): string {
  const previousTime = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  const currentTime = Date.now();
  return new Date(Math.max(currentTime, previousTime + 1)).toISOString();
}

function putRecord<T extends object>(store: IDBObjectStore, value: T): Promise<StoredValue<T>> {
  const record = value as RecordValue;
  const id = typeof record.id === "string" && record.id.length > 0 ? record.id : makeId();

  return new Promise((resolve, reject) => {
    const existingRequest = store.get(id);
    existingRequest.onerror = () => reject(existingRequest.error ?? new Error("Unable to read record"));
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as PersistedRecord | undefined;
      const createdAt = existing?.createdAt ?? record.createdAt ?? nextUpdatedAt();
      const updatedAt = existing ? nextUpdatedAt(existing.updatedAt) : (record.updatedAt ?? createdAt);
      const saved = {
        ...record,
        id,
        createdAt,
        updatedAt,
      } as StoredValue<T>;
      const saveRequest = store.put(saved);
      saveRequest.onerror = () => reject(saveRequest.error ?? new Error("Unable to save record"));
      saveRequest.onsuccess = () => resolve(saved);
    };
  });
}

function putExactRecord<T extends PersistedRecord>(store: IDBObjectStore, value: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onerror = () => reject(request.error ?? new Error("Unable to save imported record"));
    request.onsuccess = () => resolve(value);
  });
}

function inTransaction(transaction: IDBTransaction, stores: ReadonlySet<StoreName>): AppRepository {
  function objectStore(store: StoreName): IDBObjectStore {
    if (!stores.has(store)) {
      throw new Error(`Store ${store} was not included in this transaction`);
    }
    return transaction.objectStore(store);
  }

  return {
    async list<T extends PersistedRecord = PersistedRecord>(store: StoreName): Promise<T[]> {
      return (await requestResult(objectStore(store).getAll())) as T[];
    },
    async get<T extends PersistedRecord = PersistedRecord>(store: StoreName, id: string): Promise<T | undefined> {
      return ((await requestResult(objectStore(store).get(id))) as T | undefined) ?? undefined;
    },
    put<T extends object>(store: StoreName, value: T): Promise<StoredValue<T>> {
      return putRecord(objectStore(store), value);
    },
    putExact<T extends PersistedRecord>(store: StoreName, value: T): Promise<T> {
      return putExactRecord(objectStore(store), value);
    },
    async remove(store: StoreName, id: string): Promise<void> {
      await requestResult(objectStore(store).delete(id));
    },
    async clear(store: StoreName): Promise<void> {
      await requestResult(objectStore(store).clear());
    },
    async transaction<T>(): Promise<T> {
      throw new Error("Nested IndexedDB transactions are not supported");
    },
  };
}

export function createIndexedDbRepository(databaseName: string): AppRepository {
  const database = openDatabase(databaseName);

  async function run<T>(store: StoreName, mode: IDBTransactionMode, operation: (repository: AppRepository) => Promise<T>): Promise<T> {
    const connection = await database;
    const transaction = connection.transaction([store], mode);
    const completed = transactionComplete(transaction);
    const repository = inTransaction(transaction, new Set([store]));

    try {
      const result = await operation(repository);
      await completed;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      try {
        await completed;
      } catch {
        // Preserve the original operation error for callers.
      }
      throw error;
    }
  }

  return {
    list<T extends PersistedRecord = PersistedRecord>(store: StoreName): Promise<T[]> {
      return run(store, "readonly", (repository) => repository.list<T>(store));
    },
    get<T extends PersistedRecord = PersistedRecord>(store: StoreName, id: string): Promise<T | undefined> {
      return run(store, "readonly", (repository) => repository.get<T>(store, id));
    },
    put<T extends object>(store: StoreName, value: T): Promise<StoredValue<T>> {
      return run(store, "readwrite", (repository) => repository.put(store, value));
    },
    putExact<T extends PersistedRecord>(store: StoreName, value: T): Promise<T> {
      return run(store, "readwrite", (repository) => repository.putExact(store, value));
    },
    remove(store: StoreName, id: string): Promise<void> {
      return run(store, "readwrite", (repository) => repository.remove(store, id));
    },
    clear(store: StoreName): Promise<void> {
      return run(store, "readwrite", (repository) => repository.clear(store));
    },
    async transaction<T>(stores: readonly StoreName[], operation: (transaction: AppRepository) => Promise<T>, mode: IDBTransactionMode = "readwrite"): Promise<T> {
      if (stores.length === 0) {
        throw new Error("A transaction must include at least one store");
      }
      const connection = await database;
      const nativeTransaction = connection.transaction([...stores], mode);
      const completed = transactionComplete(nativeTransaction);
      const scopedRepository = inTransaction(nativeTransaction, new Set(stores));

      try {
        const result = await operation(scopedRepository);
        await completed;
        return result;
      } catch (error) {
        try {
          nativeTransaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        try {
          await completed;
        } catch {
          // Preserve the original callback error for callers.
        }
        throw error;
      }
    },
  };
}
