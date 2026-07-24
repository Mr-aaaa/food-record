import { useState } from "react";
import AppShell, { type ViewName } from "@/components/AppShell";
import Onboarding from "@/components/Onboarding";
import RecordWorkspace, { type ClipboardAdapter } from "@/components/RecordWorkspace";
import TodayDashboard from "@/components/TodayDashboard";
import PlanWorkspace from "@/components/PlanWorkspace";
import TrendsWorkspace from "@/components/TrendsWorkspace";
import DataWorkspace, { type BackupDownloadAdapter } from "@/components/DataWorkspace";
import SettingsWorkspace from "@/components/SettingsWorkspace";
import { localDateKey } from "@/domain/local-date";
import { AppStoreProvider, useAppStore } from "@/state/app-store";
import type { AppRepository } from "@/storage/repository";

function AppContent({ clipboard, downloadBackup }: Readonly<{ clipboard?: ClipboardAdapter; downloadBackup?: BackupDownloadAdapter }>) {
  const { profile, selectedPlan, target, records, isHydrating, repository, reload, targetForDate, ensureTargetForDate, persistenceError, clearPersistenceError } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [currentView, setCurrentView] = useState<ViewName>("today");

  if (isHydrating) return <main className="hydration-state" role="status">正在恢复你的数据…</main>;
  if (!profile || !selectedPlan || !target) return (
    <main className="onboarding-layout">
      <Onboarding />
      <section className="onboarding-restore workspace-section" aria-labelledby="restore-existing-backup">
        <h2 id="restore-existing-backup">恢复已有备份</h2>
        <p className="estimate-copy">已有完整本地备份？在此恢复，无需创建新资料。</p>
        <DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} showExport={false} />
      </section>
    </main>
  );

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

  const showDateNav = currentView === "today" || currentView === "record" || currentView === "plans";

  return (
    <AppShell currentView={currentView} onNavigate={setCurrentView}>
      {persistenceError && (
        <section className="error-summary global-storage-error" role="alert">
          <strong>存储空间已满</strong>
          <p>{persistenceError}</p>
          <button type="button" className="primary-button" onClick={() => setCurrentView("data")}>{"立即导出完整备份"}</button>
          <button type="button" onClick={clearPersistenceError}>{"关闭"}</button>
        </section>
      )}
      {showDateNav && (
        <nav className="date-navigation" aria-label="每日历日导航">
          <button type="button" onClick={() => shiftDate(-1)}>{"前一天"}</button>
          <label>{"选择日期"}<input type="date" value={selectedDate} onChange={(event) => chooseDate(event.target.value)} /></label>
          <button type="button" onClick={() => shiftDate(1)}>{"后一天"}</button>
          <button type="button" onClick={() => chooseDate(localDateKey(new Date()))}>{"今日"}</button>
        </nav>
      )}
      <div className="view-container">
        {currentView === "today" && <TodayDashboard records={currentRecords} target={selectedTarget} date={selectedDate} />}
        {currentView === "record" && <RecordWorkspace clipboard={clipboard} date={selectedDate} />}
        {currentView === "trends" && <TrendsWorkspace />}
        {currentView === "plans" && <PlanWorkspace records={currentRecords} date={selectedDate} />}
        {currentView === "settings" && <SettingsWorkspace />}
        {currentView === "data" && <DataWorkspace repository={repository} appVersion="0.1.0" onRestored={reload} downloadBackup={downloadBackup} />}
      </div>
    </AppShell>
  );
}

export default function App({ repository, clipboard, downloadBackup }: Readonly<{ repository?: AppRepository; clipboard?: ClipboardAdapter; downloadBackup?: BackupDownloadAdapter }> = {}) {
  return <AppStoreProvider repository={repository}><AppContent clipboard={clipboard} downloadBackup={downloadBackup} /></AppStoreProvider>;
}
