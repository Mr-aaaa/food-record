"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import { applyPlan } from "@/domain/energy";
import { localDateKey } from "@/domain/local-date";
import type {
  BodyMetric, CustomFood, FoodItem, MacroTargets, MealRecord, MealStatus, MealTemplate,
  MealType, PersistedRecord, PlanDefinition, TargetSnapshot, UserProfile, StoreName} from "@/domain/types";
import { createDailyTargetSnapshot } from "@/domain/workflows";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import { isQuotaExceededError, storageErrorMessage } from "@/storage/errors";
import type { AppRepository } from "@/storage/repository";

export const APP_DATABASE_NAME = "food-calorie-analysis";

export function currentCalculationDate(date: Date = new Date()): string {
  return localDateKey(date);
}

function makeStableId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}

function deepCloneRecord(record: MealRecord, date = record.date, status: MealStatus = record.status): MealRecord {
  return {
    ...structuredClone(record),
    id: makeStableId("meal"),
    date,
    status,
    audit: record.audit ? structuredClone(record.audit) : undefined,
    foodItems: record.foodItems.map((item) => ({
      ...structuredClone(item),
      id: makeStableId("item"),
    })),
  };
}

export function cloneTemplateRecords(
  records: MealRecord[],
  date: string,
  makeId: (prefix: "meal" | "item") => string = makeStableId,
): MealRecord[] {
  return records.map((record) => ({
    ...structuredClone(record),
    id: makeId("meal"),
    date,
    status: "planned",
    audit: record.audit ? structuredClone(record.audit) : undefined,
    foodItems: record.foodItems.map((item) => ({ ...structuredClone(item), id: makeId("item") })),
  }));
}

type OnboardingSettings = PersistedRecord & { id: "onboarding"; planId: string };
type StoredProfile = UserProfile & PersistedRecord & { id: "current" };
type StoredTarget = TargetSnapshot & PersistedRecord & { id: string };
type StoredMeal = MealRecord & PersistedRecord;
type StoredCustomFood = CustomFood & PersistedRecord;
type StoredPlan = PlanDefinition & PersistedRecord;
type StoredTemplate = MealTemplate & PersistedRecord;
type StoredBodyMetric = BodyMetric & PersistedRecord;
type CompletedOnboarding = { profile: UserProfile; plan: PlanDefinition; target: TargetSnapshot };

function withoutAuditFields<T extends PersistedRecord>(value: T): Omit<T, keyof PersistedRecord> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...result } = value;
  return result;
}

function normalizeProfile(profile: UserProfile): UserProfile {
  return { ...profile, activityFactor: profile.activityFactor ?? 1.2 };
}

function plainTarget(target: StoredTarget): TargetSnapshot {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...snapshot } = target;
  return { ...snapshot, sourceProfile: normalizeProfile(snapshot.sourceProfile) };
}

function latestTarget(targets: StoredTarget[]): StoredTarget | undefined {
  return [...targets].sort((left, right) =>
    right.calculationDate.localeCompare(left.calculationDate) || right.updatedAt.localeCompare(left.updatedAt),
  )[0];
}

export type AppStoreValue = {
  repository: AppRepository;
  profile: UserProfile | null;
  selectedPlan: PlanDefinition | null;
  plans: PlanDefinition[];
  templates: MealTemplate[];
  target: TargetSnapshot | null;
  targets: TargetSnapshot[];
  records: MealRecord[];
  customFoods: CustomFood[];
  bodyMetrics: BodyMetric[];
  isHydrating: boolean;
  persistenceError: string;
  clearPersistenceError: () => void;
  reload: () => Promise<void>;
  ensureTargetForDate: (date: string) => Promise<TargetSnapshot>;
  targetForDate: (date: string) => TargetSnapshot | null;
  completeOnboarding: (value: CompletedOnboarding) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateTarget: (date: string, calories: number, macros: MacroTargets) => Promise<void>;
  saveMeal: (meal: MealRecord) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  copyMeal: (recordId: string, date: string, status: MealStatus) => Promise<void>;
  copyMealItem: (recordId: string, itemId: string) => Promise<void>;
  moveMealItem: (recordId: string, itemId: string, mealType: MealType) => Promise<void>;
  deleteMealItem: (recordId: string, itemId: string) => Promise<MealRecord>;
  restoreMealItem: (record: MealRecord, item: FoodItem) => Promise<void>;
  saveCustomFood: (food: CustomFood) => Promise<void>;
  deactivateCustomFood: (id: string) => Promise<void>;
  copyCustomFood: (id: string) => Promise<void>;
  savePlan: (plan: PlanDefinition) => Promise<void>;
  selectPlan: (plan: PlanDefinition, date?: string) => Promise<void>;
  saveTemplate: (template: MealTemplate) => Promise<void>;
  applyTemplate: (templateId: string, date: string) => Promise<void>;
  saveBodyMetric: (metric: BodyMetric) => Promise<void>;
  deleteBodyMetric: (id: string) => Promise<void>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

function createNoopRepository(): AppRepository {
  const noop = async () => {};
  return {
    list: async () => [],
    get: async () => undefined,
    put: async (_store: StoreName, value: object) => ({ ...value, id: (value as { id?: string })?.id ?? "", createdAt: "", updatedAt: "" }) as never,
    putExact: async (_store: StoreName, value: PersistedRecord) => value,
    remove: noop,
    clear: noop,
    transaction: async <T,>(_stores: readonly StoreName[], operation: (tx: AppRepository) => Promise<T>) => operation(createNoopRepository()),
  };
}

export function AppStoreProvider({ children, repository }: Readonly<{ children: React.ReactNode; repository?: AppRepository }>) {
  const repositoryRef = useRef<AppRepository | null>(repository ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [target, setTarget] = useState<TargetSnapshot | null>(null);
  const [targets, setTargets] = useState<TargetSnapshot[]>([]);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");

  const activeRepository = useCallback((): AppRepository => {
    if (repositoryRef.current) return repositoryRef.current;
    if (typeof globalThis.indexedDB === "undefined") return createNoopRepository();
    repositoryRef.current = createIndexedDbRepository(APP_DATABASE_NAME);
    return repositoryRef.current;
  }, []);

  const persist = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      if (isQuotaExceededError(error)) setPersistenceError(storageErrorMessage(error));
      throw error;
    }
  }, []);

  const load = useCallback(async () => {
    const storage = activeRepository();
    const [savedProfile, settings, savedTargets, savedMeals, savedCustomFoods, savedPlans, savedTemplates, savedBodyMetrics] = await Promise.all([
      storage.get<StoredProfile>("profile", "current"),
      storage.get<OnboardingSettings>("settings", "onboarding"),
      storage.list<StoredTarget>("targets"),
      storage.list<StoredMeal>("meals"),
      storage.list<StoredCustomFood>("customFoods"),
      storage.list<StoredPlan>("plans"),
      storage.list<StoredTemplate>("templates"),
      storage.list<StoredBodyMetric>("bodyMetrics"),
    ]);
    const planDefinitions = savedPlans.map((plan) => withoutAuditFields(plan) as PlanDefinition);
    setPlans(planDefinitions);
    setRecords(savedMeals.map((meal) => withoutAuditFields(meal) as MealRecord));
    setCustomFoods(savedCustomFoods.map((food) => withoutAuditFields(food) as CustomFood));
    setTemplates(savedTemplates.map((template) => withoutAuditFields(template) as MealTemplate));
    setBodyMetrics(savedBodyMetrics.map((metric) => withoutAuditFields(metric) as BodyMetric));
    if (!savedProfile || !settings || savedTargets.length === 0) {
      setProfile(null); setSelectedPlan(null); setTarget(null); setTargets([]);
      return;
    }
    const loadedProfile = normalizeProfile(savedProfile);
    const plan = [...BUILT_IN_PLANS, ...planDefinitions].find((candidate) => candidate.id === settings.planId);
    if (!plan) {
      setProfile(null); setSelectedPlan(null); setTarget(null); setTargets([]);
      return;
    }
    const today = currentCalculationDate();
    let daily = savedTargets.find((candidate) => candidate.id === today || candidate.calculationDate === today);
    if (!daily) {
      const previous = latestTarget(savedTargets)!;
      const generated = createDailyTargetSnapshot(plainTarget(previous), plan, today);
      daily = await persist(() => storage.put("targets", { ...generated, id: today })) as StoredTarget;
      savedTargets.push(daily);
    }
    const snapshots = savedTargets.map(plainTarget);
    setProfile(loadedProfile);
    setSelectedPlan(plan);
    setTargets(snapshots);
    setTarget(plainTarget(daily));
  }, [activeRepository, persist]);

  useEffect(() => {
    repositoryRef.current = repository ?? createIndexedDbRepository(APP_DATABASE_NAME);
    let active = true;
    setIsHydrating(true);
    void load().catch((error) => {
      if (active && isQuotaExceededError(error)) setPersistenceError(storageErrorMessage(error));
    }).finally(() => { if (active) setIsHydrating(false); });
    return () => { active = false; };
  }, [load, repository]);

  const reload = useCallback(async () => {
    setIsHydrating(true);
    try { await load(); } finally { setIsHydrating(false); }
  }, [load]);

  const targetForDate = useCallback((date: string) =>
    targets.find((candidate) => candidate.calculationDate === date) ?? null, [targets]);

  const ensureTargetForDate = useCallback(async (date: string) => {
    const existing = targetForDate(date);
    if (existing) return existing;
    if (!target || !selectedPlan) throw new Error("需要目标和计划");
    const generated = createDailyTargetSnapshot(target, selectedPlan, date);
    await persist(() => activeRepository().put("targets", { ...generated, id: date }));
    setTargets((current) => [...current, generated]);
    if (date === currentCalculationDate()) setTarget(generated);
    return generated;
  }, [activeRepository, persist, selectedPlan, target, targetForDate]);

  const completeOnboarding = useCallback(async (value: CompletedOnboarding) => {
    const daily = { ...value.target, sourceProfile: normalizeProfile(value.profile) };
    await persist(() => activeRepository().transaction(["profile", "settings", "targets"], async (transaction) => {
      await transaction.put("profile", { ...normalizeProfile(value.profile), id: "current" });
      await transaction.put("settings", { id: "onboarding", planId: value.plan.id });
      await transaction.put("targets", { ...daily, id: daily.calculationDate });
    }));
    setProfile(normalizeProfile(value.profile)); setSelectedPlan(value.plan); setTarget(daily); setTargets([daily]);
  }, [activeRepository, persist]);

  const updateProfile = useCallback(async (value: UserProfile) => {
    const normalized = normalizeProfile(value);
    await persist(() => activeRepository().put("profile", { ...normalized, id: "current" }));
    setProfile(normalized);
  }, [activeRepository, persist]);

  const updateTarget = useCallback(async (date: string, calories: number, macros: MacroTargets) => {
    const existing = targetForDate(date) ?? await ensureTargetForDate(date);
    const updated: TargetSnapshot = {
      ...existing,
      target: { ...existing.target, targetCaloriesKcal: calories },
      macroTargets: { ...macros },
      calculation: {
        formula: "Mifflin-St Jeor",
        activityFactor: existing.sourceProfile.activityFactor ?? 1.2,
        requestedDeficitRatio: existing.target.deficitRatio,
        createdAt: new Date().toISOString(),
        manuallyEdited: true,
      },
    };
    await persist(() => activeRepository().put("targets", { ...updated, id: date }));
    setTargets((current) => [...current.filter((snapshot) => snapshot.calculationDate !== date), updated]);
    if (date === currentCalculationDate()) setTarget(updated);
  }, [activeRepository, ensureTargetForDate, persist, targetForDate]);

  const saveMeal = useCallback(async (meal: MealRecord) => {
    await persist(() => activeRepository().put("meals", meal));
    setRecords((current) => [...current.filter((record) => record.id !== meal.id), meal]);
  }, [activeRepository, persist]);

  const deleteMeal = useCallback(async (id: string) => {
    await persist(() => activeRepository().remove("meals", id));
    setRecords((current) => current.filter((record) => record.id !== id));
  }, [activeRepository, persist]);

  const copyMeal = useCallback(async (recordId: string, date: string, status: MealStatus) => {
    const source = records.find((record) => record.id === recordId);
    if (!source) throw new Error("餐饮记录已不存在");
    const copied = deepCloneRecord(source, date, status);
    await persist(() => activeRepository().put("meals", copied));
    setRecords((current) => [...current, copied]);
  }, [activeRepository, persist, records]);

  const copyMealItem = useCallback(async (recordId: string, itemId: string) => {
    const record = records.find((candidate) => candidate.id === recordId);
    const item = record?.foodItems.find((candidate) => candidate.id === itemId);
    if (!record || !item) throw new Error("食物项已不存在");
    const copied: MealRecord = { ...deepCloneRecord(record), foodItems: [{ ...structuredClone(item), id: makeStableId("item") }] };
    await persist(() => activeRepository().put("meals", copied));
    setRecords((current) => [...current, copied]);
  }, [activeRepository, persist, records]);

  const moveMealItem = useCallback(async (recordId: string, itemId: string, mealType: MealType) => {
    const record = records.find((candidate) => candidate.id === recordId);
    const item = record?.foodItems.find((candidate) => candidate.id === itemId);
    if (!record || !item) throw new Error("食物项已不存在");
    if (record.foodItems.length === 1) {
      const moved = { ...record, mealType };
      await persist(() => activeRepository().put("meals", moved));
      setRecords((current) => current.map((candidate) => candidate.id === moved.id ? moved : candidate));
      return;
    }
    const remaining = { ...record, foodItems: record.foodItems.filter((candidate) => candidate.id !== itemId) };
    const moved: MealRecord = { ...deepCloneRecord(record), mealType, foodItems: [{ ...structuredClone(item), id: makeStableId("item") }] };
    await persist(() => activeRepository().transaction(["meals"], async (transaction) => {
      await transaction.put("meals", remaining); await transaction.put("meals", moved);
    }));
    setRecords((current) => [...current.map((candidate) => candidate.id === recordId ? remaining : candidate), moved]);
  }, [activeRepository, persist, records]);

  const deleteMealItem = useCallback(async (recordId: string, itemId: string) => {
    const record = records.find((candidate) => candidate.id === recordId);
    if (!record || !record.foodItems.some((candidate) => candidate.id === itemId)) throw new Error("食物项已不存在");
    if (record.foodItems.length === 1) await persist(() => activeRepository().remove("meals", recordId));
    else await persist(() => activeRepository().put("meals", { ...record, foodItems: record.foodItems.filter((candidate) => candidate.id !== itemId) }));
    setRecords((current) => current.flatMap((candidate) => candidate.id !== recordId ? [candidate] : candidate.foodItems.length === 1 ? [] : [{ ...candidate, foodItems: candidate.foodItems.filter((food) => food.id !== itemId) }]));
    return record;
  }, [activeRepository, persist, records]);

  const restoreMealItem = useCallback(async (record: MealRecord, item: FoodItem) => {
    const current = records.find((candidate) => candidate.id === record.id);
    const restored = current ? { ...current, foodItems: [...current.foodItems, item] } : record;
    await persist(() => activeRepository().put("meals", restored));
    setRecords((all) => current ? all.map((candidate) => candidate.id === record.id ? restored : candidate) : [...all, restored]);
  }, [activeRepository, persist, records]);

  const saveCustomFood = useCallback(async (food: CustomFood) => {
    const normalized = { ...food, active: food.active ?? true };
    await persist(() => activeRepository().put("customFoods", normalized));
    setCustomFoods((current) => [...current.filter((item) => item.id !== food.id), normalized]);
  }, [activeRepository, persist]);

  const deactivateCustomFood = useCallback(async (id: string) => {
    const food = customFoods.find((candidate) => candidate.id === id);
    if (!food) throw new Error("自定义食物已不存在");
    await saveCustomFood({ ...food, active: false });
  }, [customFoods, saveCustomFood]);

  const copyCustomFood = useCallback(async (id: string) => {
    const food = customFoods.find((candidate) => candidate.id === id);
    if (!food) throw new Error("自定义食物已不存在");
    await saveCustomFood({ ...structuredClone(food), id: makeStableId("custom"), name: `${food.name} copy`, active: true });
  }, [customFoods, saveCustomFood]);

  const savePlan = useCallback(async (plan: PlanDefinition) => {
    await persist(() => activeRepository().put("plans", plan));
    setPlans((current) => [...current.filter((item) => item.id !== plan.id), plan]);
  }, [activeRepository, persist]);

  const selectPlan = useCallback(async (plan: PlanDefinition, date = currentCalculationDate()) => {
    if (!profile || !target) throw new Error("选择计划前需要先完善个人资料和目标");
    const base = targetForDate(date) ?? target;
    const nextTarget = createDailyTargetSnapshot(base, plan, date);
    await persist(() => activeRepository().transaction(["settings", "targets"], async (transaction) => {
      await transaction.put("settings", { id: "onboarding", planId: plan.id });
      await transaction.put("targets", { ...nextTarget, id: date });
    }));
    setSelectedPlan(plan);
    setTargets((current) => [...current.filter((snapshot) => snapshot.calculationDate !== date), nextTarget]);
    if (date === currentCalculationDate()) setTarget(nextTarget);
  }, [activeRepository, persist, profile, target, targetForDate]);

  const saveTemplate = useCallback(async (template: MealTemplate) => {
    await persist(() => activeRepository().put("templates", structuredClone(template)));
    setTemplates((current) => [...current.filter((item) => item.id !== template.id), structuredClone(template)]);
  }, [activeRepository, persist]);

  const applyTemplate = useCallback(async (templateId: string, date: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) throw new Error("模板已不存在");
    const applied = cloneTemplateRecords(template.records, date);
    await persist(() => activeRepository().transaction(["meals"], async (transaction) => {
      for (const record of applied) await transaction.put("meals", record);
    }));
    setRecords((current) => [...current, ...applied]);
  }, [activeRepository, persist, templates]);

  const saveBodyMetric = useCallback(async (metric: BodyMetric) => {
    await persist(() => activeRepository().put("bodyMetrics", metric));
    setBodyMetrics((current) => [...current.filter((item) => item.id !== metric.id), metric]);
  }, [activeRepository, persist]);

  const deleteBodyMetric = useCallback(async (id: string) => {
    await persist(() => activeRepository().remove("bodyMetrics", id));
    setBodyMetrics((current) => current.filter((item) => item.id !== id));
  }, [activeRepository, persist]);

  const value = useMemo<AppStoreValue>(() => ({
    repository: activeRepository(), profile, selectedPlan, plans, templates, target, targets, records,
    customFoods, bodyMetrics, isHydrating, persistenceError,
    clearPersistenceError: () => setPersistenceError(""),
    reload, ensureTargetForDate, targetForDate, completeOnboarding, updateProfile, updateTarget,
    saveMeal, deleteMeal, copyMeal, copyMealItem, moveMealItem, deleteMealItem, restoreMealItem,
    saveCustomFood, deactivateCustomFood, copyCustomFood, savePlan, selectPlan, saveTemplate,
    applyTemplate, saveBodyMetric, deleteBodyMetric,
  }), [
    activeRepository, profile, selectedPlan, plans, templates, target, targets, records, customFoods,
    bodyMetrics, isHydrating, persistenceError, reload, ensureTargetForDate, targetForDate,
    completeOnboarding, updateProfile, updateTarget, saveMeal, deleteMeal, copyMeal, copyMealItem,
    moveMealItem, deleteMealItem, restoreMealItem, saveCustomFood, deactivateCustomFood, copyCustomFood,
    savePlan, selectPlan, saveTemplate, applyTemplate, saveBodyMetric, deleteBodyMetric,
  ]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore 必须在 AppStoreProvider 内部使用");
  return value;
}
