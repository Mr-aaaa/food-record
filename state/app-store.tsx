"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import type { CustomFood, FoodItem, MealRecord, MealType, PersistedRecord, PlanDefinition, TargetSnapshot, UserProfile } from "@/domain/types";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import type { AppRepository } from "@/storage/repository";

export const APP_DATABASE_NAME = "food-calorie-analysis";

type OnboardingSettings = PersistedRecord & { id: "onboarding"; planId: string };
type StoredProfile = UserProfile & PersistedRecord & { id: "current" };
type StoredTarget = TargetSnapshot & PersistedRecord & { id: "current" };
type StoredMeal = MealRecord & PersistedRecord;
type StoredCustomFood = CustomFood & PersistedRecord;
type CompletedOnboarding = { profile: UserProfile; plan: PlanDefinition; target: TargetSnapshot };

type AppStoreValue = {
  profile: UserProfile | null;
  selectedPlan: PlanDefinition | null;
  target: TargetSnapshot | null;
  records: MealRecord[];
  customFoods: CustomFood[];
  isHydrating: boolean;
  completeOnboarding: (value: CompletedOnboarding) => Promise<void>;
  saveMeal: (meal: MealRecord) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  copyMealItem: (recordId: string, itemId: string) => Promise<void>;
  moveMealItem: (recordId: string, itemId: string, mealType: MealType) => Promise<void>;
  deleteMealItem: (recordId: string, itemId: string) => Promise<MealRecord>;
  restoreMealItem: (record: MealRecord, item: FoodItem) => Promise<void>;
  saveCustomFood: (food: CustomFood) => Promise<void>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children, repository }: Readonly<{ children: React.ReactNode; repository?: AppRepository }>) {
  const repositoryRef = useRef<AppRepository | null>(repository ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [target, setTarget] = useState<TargetSnapshot | null>(null);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const activeRepository = repository ?? createIndexedDbRepository(APP_DATABASE_NAME);
    repositoryRef.current = activeRepository;
    let active = true;
    setIsHydrating(true);
    void Promise.all([
      activeRepository.get<StoredProfile>("profile", "current"),
      activeRepository.get<OnboardingSettings>("settings", "onboarding"),
      activeRepository.get<StoredTarget>("targets", "current"),
      activeRepository.list<StoredMeal>("meals"),
      activeRepository.list<StoredCustomFood>("customFoods"),
    ]).then(([savedProfile, settings, savedTarget, savedMeals, savedCustomFoods]) => {
      if (!active) return;
      setRecords(savedMeals.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...meal }) => meal));
      setCustomFoods(savedCustomFoods.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...food }) => food));
      if (!savedProfile || !settings || !savedTarget) return;
      const savedPlan = BUILT_IN_PLANS.find((plan) => plan.id === settings.planId);
      if (!savedPlan) return;
      setProfile({ sex: savedProfile.sex, age: savedProfile.age, heightCm: savedProfile.heightCm, weightKg: savedProfile.weightKg, goalWeightKg: savedProfile.goalWeightKg });
      setSelectedPlan(savedPlan);
      setTarget({ calculationDate: savedTarget.calculationDate, sourceProfile: savedTarget.sourceProfile, target: savedTarget.target, macroTargets: savedTarget.macroTargets, planId: savedTarget.planId });
    }).catch(() => {
      // Storage is optional; a new visit remains usable without it.
    }).finally(() => { if (active) setIsHydrating(false); });
    return () => { active = false; };
  }, [repository]);

  const activeRepository = useCallback(() => {
    const current = repositoryRef.current ?? createIndexedDbRepository(APP_DATABASE_NAME);
    repositoryRef.current = current;
    return current;
  }, []);

  const completeOnboarding = useCallback(async (value: CompletedOnboarding) => {
    await activeRepository().transaction(["profile", "settings", "targets"], async (transaction) => {
      await transaction.put("profile", { ...value.profile, id: "current" });
      await transaction.put("settings", { id: "onboarding", planId: value.plan.id });
      await transaction.put("targets", { ...value.target, id: "current" });
    });
    setProfile(value.profile); setSelectedPlan(value.plan); setTarget(value.target);
  }, [activeRepository]);

  const saveMeal = useCallback(async (meal: MealRecord) => {
    await activeRepository().put("meals", meal);
    setRecords((current) => [...current.filter((record) => record.id !== meal.id), meal]);
  }, [activeRepository]);

  const deleteMeal = useCallback(async (id: string) => {
    await activeRepository().remove("meals", id);
    setRecords((current) => current.filter((record) => record.id !== id));
  }, [activeRepository]);

  const copyMealItem = useCallback(async (recordId: string, itemId: string) => {
    const record = records.find((candidate) => candidate.id === recordId);
    const item = record?.foodItems.find((candidate) => candidate.id === itemId);
    if (!record || !item) throw new Error("Meal item no longer exists");
    const copied: MealRecord = { ...record, id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, foodItems: [{ ...item, id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }] };
    await activeRepository().put("meals", copied);
    setRecords((current) => [...current, copied]);
  }, [activeRepository, records]);

  const moveMealItem = useCallback(async (recordId: string, itemId: string, mealType: MealType) => {
    const record = records.find((candidate) => candidate.id === recordId);
    const item = record?.foodItems.find((candidate) => candidate.id === itemId);
    if (!record || !item) throw new Error("Meal item no longer exists");
    if (record.foodItems.length === 1) {
      const moved = { ...record, mealType };
      await activeRepository().put("meals", moved);
      setRecords((current) => current.map((candidate) => candidate.id === moved.id ? moved : candidate));
      return;
    }
    const remaining = { ...record, foodItems: record.foodItems.filter((candidate) => candidate.id !== itemId) };
    const moved: MealRecord = { ...record, id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, mealType, foodItems: [item] };
    await activeRepository().transaction(["meals"], async (transaction) => { await transaction.put("meals", remaining); await transaction.put("meals", moved); });
    setRecords((current) => [...current.map((candidate) => candidate.id === recordId ? remaining : candidate), moved]);
  }, [activeRepository, records]);

  const deleteMealItem = useCallback(async (recordId: string, itemId: string) => {
    const record = records.find((candidate) => candidate.id === recordId);
    if (!record || !record.foodItems.some((candidate) => candidate.id === itemId)) throw new Error("Meal item no longer exists");
    if (record.foodItems.length === 1) await activeRepository().remove("meals", recordId);
    else await activeRepository().put("meals", { ...record, foodItems: record.foodItems.filter((candidate) => candidate.id !== itemId) });
    setRecords((current) => current.flatMap((candidate) => candidate.id !== recordId ? [candidate] : candidate.foodItems.length === 1 ? [] : [{ ...candidate, foodItems: candidate.foodItems.filter((food) => food.id !== itemId) }]));
    return record;
  }, [activeRepository, records]);

  const restoreMealItem = useCallback(async (record: MealRecord, item: FoodItem) => {
    const current = records.find((candidate) => candidate.id === record.id);
    const restored = current ? { ...current, foodItems: [...current.foodItems, item] } : record;
    await activeRepository().put("meals", restored);
    setRecords((all) => current ? all.map((candidate) => candidate.id === record.id ? restored : candidate) : [...all, restored]);
  }, [activeRepository, records]);

  const saveCustomFood = useCallback(async (food: CustomFood) => {
    await activeRepository().put("customFoods", food);
    setCustomFoods((current) => [...current.filter((item) => item.id !== food.id), food]);
  }, [activeRepository]);

  const value = useMemo(() => ({ profile, selectedPlan, target, records, customFoods, isHydrating, completeOnboarding, saveMeal, deleteMeal, copyMealItem, moveMealItem, deleteMealItem, restoreMealItem, saveCustomFood }), [profile, selectedPlan, target, records, customFoods, isHydrating, completeOnboarding, saveMeal, deleteMeal, copyMealItem, moveMealItem, deleteMealItem, restoreMealItem, saveCustomFood]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
