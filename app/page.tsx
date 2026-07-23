"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import RecordWorkspace, { type ClipboardAdapter } from "@/components/RecordWorkspace";
import TodayDashboard from "@/components/TodayDashboard";
import PlanWorkspace from "@/components/PlanWorkspace";
import TrendsWorkspace from "@/components/TrendsWorkspace";
import DataWorkspace, { type BackupDownloadAdapter } from "@/components/DataWorkspace";
import { localDateKey } from "@/domain/local-date";
import { AppStoreProvider, useAppStore } from "@/state/app-store";
import type { AppRepository } from "@/storage/repository";

function AppContent({ clipboard, downloadBackup }: Readonly<{ clipboard?: ClipboardAdapter; downloadBackup?: BackupDownloadAdapter }>) {
  const { profile, selectedPlan, target, records, isHydrating, repository, reload, targetForDate, ensureTargetForDate, persistenceError, clearPersistenceError } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  if (isHydrating) return <main className="hydration-state" role="status">正在恢复你的数据…</main>;
  if (!profile || !selectedPlan || !target) return <main className="onboarding-layout"><Onboarding /><section className="onboarding-restore workspace-section" aria-labelledby="restore-existing-backup"><h2 id="restore-existing-backup">Restore existing backup</h2><p className="estimate-copy">Already have a full local backup? Restore it here instead of creating a new profile.</p><DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} showExport={false} /></section></main>;
  const currentRecords = records.filter((record) => record.date === selectedDate);
  const selectedTarget = targetForDate(selectedDate) ?? target;
  function chooseDate(value: string) {
    setSelectedDate(value);
    void ensureTargetForDate(value);
  }
  function shiftDate(days: number) {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + days);
    chooseDate(localDateKey(next));
  }
  return <AppShell>
    {persistenceError && <section className="error-summary global-storage-error" role="alert"><strong>Storage full</strong><p>{persistenceError}</p><a className="primary-button" href="#data">Export full backup now</a><button type="button" onClick={clearPersistenceError}>Dismiss</button></section>}
    <nav className="date-navigation" aria-label="Daily history navigation">
      <button type="button" onClick={() => shiftDate(-1)}>Previous day</button>
      <label>Browse date<input type="date" value={selectedDate} onChange={(event) => chooseDate(event.target.value)} /></label>
      <button type="button" onClick={() => shiftDate(1)}>Next day</button>
      <button type="button" onClick={() => chooseDate(localDateKey(new Date()))}>Today</button>
    </nav>
    <TodayDashboard records={currentRecords} target={selectedTarget} date={selectedDate} />
    <RecordWorkspace clipboard={clipboard} date={selectedDate} />
    <TrendsWorkspace />
    <PlanWorkspace records={currentRecords} date={selectedDate} />
    <div id="settings"><DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} downloadBackup={downloadBackup} /></div>
  </AppShell>;
}

export default function HomePage({ repository, clipboard, downloadBackup }: Readonly<{ repository?: AppRepository; clipboard?: ClipboardAdapter; downloadBackup?: BackupDownloadAdapter }> = {}) {
  return <AppStoreProvider repository={repository}><AppContent clipboard={clipboard} downloadBackup={downloadBackup} /></AppStoreProvider>;
}
