"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import type { PersistedRecord, PlanDefinition, TargetSnapshot, UserProfile } from "@/domain/types";
import { createIndexedDbRepository } from "@/storage/indexed-db";
import type { AppRepository } from "@/storage/repository";

export const APP_DATABASE_NAME = "food-calorie-analysis";

type OnboardingSettings = PersistedRecord & {
  id: "onboarding";
  planId: string;
};

type StoredProfile = UserProfile & PersistedRecord & { id: "current" };
type StoredTarget = TargetSnapshot & PersistedRecord & { id: "current" };

type CompletedOnboarding = {
  profile: UserProfile;
  plan: PlanDefinition;
  target: TargetSnapshot;
};

type AppStoreValue = {
  profile: UserProfile | null;
  selectedPlan: PlanDefinition | null;
  target: TargetSnapshot | null;
  completeOnboarding: (value: CompletedOnboarding) => Promise<void>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({
  children,
  repository,
}: Readonly<{
  children: React.ReactNode;
  repository?: AppRepository;
}>) {
  const repositoryRef = useRef<AppRepository | null>(repository ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [target, setTarget] = useState<TargetSnapshot | null>(null);

  useEffect(() => {
    const activeRepository = repository ?? createIndexedDbRepository(APP_DATABASE_NAME);
    repositoryRef.current = activeRepository;
    let active = true;

    void Promise.all([
      activeRepository.get<StoredProfile>("profile", "current"),
      activeRepository.get<OnboardingSettings>("settings", "onboarding"),
      activeRepository.get<StoredTarget>("targets", "current"),
    ])
      .then(([savedProfile, settings, savedTarget]) => {
        if (!active || !savedProfile || !settings || !savedTarget) {
          return;
        }

        const savedPlan = BUILT_IN_PLANS.find((plan) => plan.id === settings.planId);
        if (!savedPlan) {
          return;
        }

        setProfile({
          sex: savedProfile.sex,
          age: savedProfile.age,
          heightCm: savedProfile.heightCm,
          weightKg: savedProfile.weightKg,
          goalWeightKg: savedProfile.goalWeightKg,
        });
        setSelectedPlan(savedPlan);
        setTarget({
          calculationDate: savedTarget.calculationDate,
          sourceProfile: savedTarget.sourceProfile,
          target: savedTarget.target,
          macroTargets: savedTarget.macroTargets,
          planId: savedTarget.planId,
        });
      })
      .catch(() => {
        // A first visit should remain usable even if browser storage is unavailable.
      });

    return () => {
      active = false;
    };
  }, [repository]);

  const completeOnboarding = useCallback(async (value: CompletedOnboarding) => {
    const activeRepository = repositoryRef.current ?? createIndexedDbRepository(APP_DATABASE_NAME);
    repositoryRef.current = activeRepository;

    await activeRepository.transaction(["profile", "settings", "targets"], async (transaction) => {
      await transaction.put("profile", { ...value.profile, id: "current" });
      await transaction.put("settings", { id: "onboarding", planId: value.plan.id });
      await transaction.put("targets", { ...value.target, id: "current" });
    });

    setProfile(value.profile);
    setSelectedPlan(value.plan);
    setTarget(value.target);
  }, []);

  const value = useMemo(
    () => ({ profile, selectedPlan, target, completeOnboarding }),
    [profile, selectedPlan, target, completeOnboarding],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) {
    throw new Error("useAppStore must be used inside AppStoreProvider");
  }
  return value;
}
