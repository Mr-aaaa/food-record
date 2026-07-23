"use client";

import AppShell from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import { AppStoreProvider, useAppStore } from "@/state/app-store";

function AppContent() {
  const { profile, selectedPlan, target } = useAppStore();

  if (!profile || !selectedPlan || !target) {
    return <Onboarding />;
  }

  return (
    <AppShell>
      <section className="dashboard-placeholder" id="today">
        <p className="eyebrow">今日</p>
        <h1>今日</h1>
        <p>每日目标已设置：{Math.round(target.target.targetCaloriesKcal)} 千卡。</p>
      </section>
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <AppStoreProvider>
      <AppContent />
    </AppStoreProvider>
  );
}
