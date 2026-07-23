"use client";

import { useEffect, useRef, useState } from "react";
import { BACKUP_STORES, backupImpact, exportAll, restoreBackup, validateBackup, type AppBackup } from "@/storage/backup";
import type { AppRepository } from "@/storage/repository";

type RestoreMode = "merge" | "replace";

export type BackupDownload = Readonly<{
  fileName: string;
  text: string;
  mediaType: "application/json";
}>;

export type BackupDownloadAdapter = (download: BackupDownload) => Promise<void> | void;

async function readFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read backup file."));
    reader.readAsText(file);
  });
}

function downloadInBrowser({ fileName, text, mediaType }: BackupDownload): void {
  const anchor = document.createElement("a");
  anchor.download = fileName;
  const blob = new Blob([text], { type: mediaType });
  const objectUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `data:${mediaType},${encodeURIComponent(text)}`;
  anchor.href = objectUrl;
  anchor.click();
  if (typeof URL.revokeObjectURL === "function" && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
}

export default function DataWorkspace({ repository, appVersion, onRestored, showExport = true, downloadBackup = downloadInBrowser }: Readonly<{ repository: AppRepository; appVersion: string; onRestored: () => Promise<void> | void; showExport?: boolean; downloadBackup?: BackupDownloadAdapter }>) {
  const [backup, setBackup] = useState<AppBackup | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) errorRef.current?.focus();
  }, [errors]);

  const totalRecords = backup ? Object.values(backupImpact(backup)).reduce((sum, count) => sum + count, 0) : 0;

  async function downloadFullBackup() {
    setBusy(true); setErrors([]);
    try {
      const exported = await exportAll(repository, appVersion);
      const text = JSON.stringify(exported, null, 2);
      await downloadBackup({
        fileName: `nutrition-backup-${exported.exportedAt.slice(0, 10)}.json`,
        text,
        mediaType: "application/json",
      });
    } catch (error) { setErrors([error instanceof Error ? error.message : "Unable to create backup."]); }
    finally { setBusy(false); }
  }

  async function selectFile(file?: File) {
    setBackup(null); setErrors([]); setConfirmedReplace(false);
    if (!file) return;
    try {
      const validation = validateBackup(await readFile(file));
      if (!validation.ok) { setErrors(validation.errors); return; }
      setBackup(validation.backup);
    } catch (error) { setErrors([error instanceof Error ? error.message : "Unable to read backup file."]); }
  }

  async function restore() {
    if (!backup || (mode === "replace" && !confirmedReplace)) return;
    setBusy(true); setErrors([]);
    try {
      await restoreBackup(repository, backup, mode);
      await onRestored();
    } catch (error) { setErrors([error instanceof Error ? error.message : "Restore failed; your data was not changed."]); }
    finally { setBusy(false); }
  }

  return <section id="data" className="workspace-section data-workspace" aria-busy={busy} aria-labelledby="data-workspace-title">
    <p className="eyebrow">Data</p>
    <h2 id="data-workspace-title">Data backup and restore</h2>
    <p className="privacy-note">Your backup contains your personal nutrition and body data. Keep it private and store it securely.</p>
    {showExport && <button className="primary-button" type="button" onClick={() => void downloadFullBackup()} disabled={busy}>{busy ? "Preparing backup…" : "Download full backup"}</button>}
    <div className="file-field">
      <label htmlFor="backup-file">Backup file</label>
      <input id="backup-file" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} />
    </div>
    {errors.length > 0 && <div className="error-summary" ref={errorRef} role="alert" tabIndex={-1}><strong>Backup file could not be used.</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {backup && <div className="restore-preview" aria-live="polite">
      <h3>Restore impact</h3>
      <p>{totalRecords} records ready to restore from app version {backup.appVersion}.</p>
      <ul>{BACKUP_STORES.map((store) => <li key={store}>{store}: {backup.stores[store].length}</li>)}</ul>
      <label className="choice-row"><input type="radio" name="restore-mode" checked={mode === "merge"} onChange={() => { setMode("merge"); setConfirmedReplace(false); }} /> Merge with existing data</label>
      <label className="choice-row"><input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace all local data</label>
      {mode === "replace" && <label className="choice-row warning-choice"><input type="checkbox" checked={confirmedReplace} onChange={(event) => setConfirmedReplace(event.target.checked)} /> I understand this permanently replaces my local data</label>}
      <button className="primary-button" type="button" onClick={() => void restore()} disabled={busy || (mode === "replace" && !confirmedReplace)}>{busy ? "Restoring…" : "Restore backup"}</button>
    </div>}
  </section>;
}
