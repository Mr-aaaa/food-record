"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import type { CustomFood, MealRecord, PersistedRecord, PlanDefinition, TargetSnapshot, UserProfile } from "@/domain/types";
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

  const saveCustomFood = useCallback(async (food: CustomFood) => {
    await activeRepository().put("customFoods", food);
    setCustomFoods((current) => [...current.filter((item) => item.id !== food.id), food]);
  }, [activeRepository]);

  const value = useMemo(() => ({ profile, selectedPlan, target, records, customFoods, isHydrating, completeOnboarding, saveMeal, deleteMeal, saveCustomFood }), [profile, selectedPlan, target, records, customFoods, isHydrating, completeOnboarding, saveMeal, deleteMeal, saveCustomFood]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
