"use client";

import AppShell from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import RecordWorkspace, { type ClipboardAdapter } from "@/components/RecordWorkspace";
import TodayDashboard from "@/components/TodayDashboard";
import PlanWorkspace from "@/components/PlanWorkspace";
import TrendsWorkspace from "@/components/TrendsWorkspace";
import DataWorkspace from "@/components/DataWorkspace";
import { localDateKey } from "@/domain/local-date";
import { AppStoreProvider, useAppStore } from "@/state/app-store";
import type { AppRepository } from "@/storage/repository";

function AppContent({ clipboard }: Readonly<{ clipboard?: ClipboardAdapter }>) {
  const { profile, selectedPlan, target, records, isHydrating, repository, reload } = useAppStore();
  if (isHydrating) return <main className="hydration-state" role="status">正在恢复你的数据…</main>;
  if (!profile || !selectedPlan || !target) return <div className="onboarding-layout"><Onboarding /><section className="onboarding-restore workspace-section" aria-labelledby="restore-existing-backup"><h2 id="restore-existing-backup">Restore existing backup</h2><p className="estimate-copy">Already have a full local backup? Restore it here instead of creating a new profile.</p><DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} showExport={false} /></section></div>;
  const currentRecords = records.filter((record) => record.date === localDateKey(new Date()));
  return <AppShell><TodayDashboard records={currentRecords} target={target} /><RecordWorkspace clipboard={clipboard} /><TrendsWorkspace /><PlanWorkspace records={currentRecords} date={localDateKey(new Date())} /><div id="settings"><DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} /></div></AppShell>;
}

export default function HomePage({ repository, clipboard }: Readonly<{ repository?: AppRepository; clipboard?: ClipboardAdapter }> = {}) {
  return <AppStoreProvider repository={repository}><AppContent clipboard={clipboard} /></AppStoreProvider>;
}
