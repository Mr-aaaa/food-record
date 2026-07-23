"use client";

import AppShell from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import { AppStoreProvider, useAppStore } from "@/state/app-store";
import type { AppRepository } from "@/storage/repository";

function AppContent() {
  const { profile, selectedPlan, target, isHydrating } = useAppStore();

  if (isHydrating) {
    return <main className="hydration-state" role="status">正在恢复你的数据…</main>;
  }

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

export default function HomePage({ repository }: Readonly<{ repository?: AppRepository }> = {}) {
  return (
    <AppStoreProvider repository={repository}>
      <AppContent />
    </AppStoreProvider>
  );
}
