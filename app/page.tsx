"use client";

import AppShell from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import RecordWorkspace, { type ClipboardAdapter } from "@/components/RecordWorkspace";
import TodayDashboard from "@/components/TodayDashboard";
import { AppStoreProvider, useAppStore } from "@/state/app-store";
import type { AppRepository } from "@/storage/repository";

function AppContent({ clipboard }: Readonly<{ clipboard?: ClipboardAdapter }>) {
  const { profile, selectedPlan, target, records, isHydrating } = useAppStore();
  if (isHydrating) return <main className="hydration-state" role="status">正在恢复你的数据…</main>;
  if (!profile || !selectedPlan || !target) return <Onboarding />;
  return <AppShell><TodayDashboard records={records} target={target} /><RecordWorkspace clipboard={clipboard} /></AppShell>;
}

export default function HomePage({ repository, clipboard }: Readonly<{ repository?: AppRepository; clipboard?: ClipboardAdapter }> = {}) {
  return <AppStoreProvider repository={repository}><AppContent clipboard={clipboard} /></AppStoreProvider>;
}
