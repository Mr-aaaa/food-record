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
    reader.onerror = () => reject(reader.error ?? new Error("无法读取备份文件。"));
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
    } catch (error) { setErrors([error instanceof Error ? error.message : "无法创建备份。"]); }
    finally { setBusy(false); }
  }

  async function selectFile(file?: File) {
    setBackup(null); setErrors([]); setConfirmedReplace(false);
    if (!file) return;
    try {
      const validation = validateBackup(await readFile(file));
      if (!validation.ok) { setErrors(validation.errors); return; }
      setBackup(validation.backup);
    } catch (error) { setErrors([error instanceof Error ? error.message : "无法读取备份文件。"]); }
  }

  async function restore() {
    if (!backup || (mode === "replace" && !confirmedReplace)) return;
    setBusy(true); setErrors([]);
    try {
      await restoreBackup(repository, backup, mode);
      await onRestored();
    } catch (error) { setErrors([error instanceof Error ? error.message : "恢复失败，数据未更改。"]); }
    finally { setBusy(false); }
  }

  return <section id="data" className="workspace-section data-workspace" aria-busy={busy} aria-labelledby="data-workspace-title">
    <p className="eyebrow">数据</p>
    <h2 id="data-workspace-title">数据备份与恢复</h2>
    <p className="privacy-note">备份文件包含你的个人营养和身体数据。请妥善保管，注意隐私安全。</p>
    {showExport && <button className="primary-button" type="button" onClick={() => void downloadFullBackup()} disabled={busy}>{busy ? "正在准备备份…" : "下载完整备份"}</button>}
    <div className="file-field">
      <label htmlFor="backup-file">备份文件</label>
      <input id="backup-file" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} />
    </div>
    {errors.length > 0 && <div className="error-summary" ref={errorRef} role="alert" tabIndex={-1}><strong>备份文件无法使用。</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {backup && <div className="restore-preview" aria-live="polite">
      <h3>恢复影响</h3>
      <p>{totalRecords} 条记录可从应用版本 {backup.appVersion} 恢复。</p>
      <ul>{BACKUP_STORES.map((store) => <li key={store}>{store}: {backup.stores[store].length}</li>)}</ul>
      <label className="choice-row"><input type="radio" name="restore-mode" checked={mode === "merge"} onChange={() => { setMode("merge"); setConfirmedReplace(false); }} /> 与现有数据合并</label>
      <label className="choice-row"><input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> 替换所有本地数据</label>
      {mode === "replace" && <label className="choice-row warning-choice"><input type="checkbox" checked={confirmedReplace} onChange={(event) => setConfirmedReplace(event.target.checked)} /> 我确认此操作将永久替换本地数据</label>}
      <button className="primary-button" type="button" onClick={() => void restore()} disabled={busy || (mode === "replace" && !confirmedReplace)}>{busy ? "正在恢复…" : "恢复备份"}</button>
    </div>}
  </section>;
}
