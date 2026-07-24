"use client";

import { useEffect, useRef, useState } from "react";
import { calculateBmr, calculateTarget, calculateTdee, evaluateProfileSafety } from "@/domain/energy";
import { localDateKey } from "@/domain/local-date";
import type { MacroTargets, UserProfile } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const ACTIVITY_OPTIONS: [string, string][] = [
  ["1.2", "久坐或轻体力活动"],
  ["1.375", "轻度活动"],
  ["1.55", "中等活动"],
  ["1.725", "高活动量"],
];

const round = (value: number) => Math.round(value * 10) / 10;

export default function SettingsWorkspace() {
  const { profile, target, updateProfile, updateTarget } = useAppStore();
  const [sex, setSex] = useState<UserProfile["sex"]>(profile?.sex ?? "female");
  const [age, setAge] = useState(String(profile?.age ?? ""));
  const [heightCm, setHeightCm] = useState(String(profile?.heightCm ?? ""));
  const [weightKg, setWeightKg] = useState(String(profile?.weightKg ?? ""));
  const [goalWeightKg, setGoalWeightKg] = useState(String(profile?.goalWeightKg ?? ""));
  const [activityFactor, setActivityFactor] = useState(String(profile?.activityFactor ?? "1.2"));
  const [deficitRatio, setDeficitRatio] = useState("0.15");
  const [calories, setCalories] = useState(String(Math.round(target?.target.targetCaloriesKcal ?? 0)));
  const [proteinG, setProteinG] = useState(String(round(target?.macroTargets.proteinG ?? 0)));
  const [carbohydrateG, setCarbohydrateG] = useState(String(round(target?.macroTargets.carbohydrateG ?? 0)));
  const [fatG, setFatG] = useState(String(round(target?.macroTargets.fatG ?? 0)));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function parseProfile(): UserProfile | null {
    const ageNum = Number(age);
    const heightNum = Number(heightCm);
    const weightNum = Number(weightKg);
    const goalNum = goalWeightKg.trim() === "" ? undefined : Number(goalWeightKg);
    if (!Number.isFinite(ageNum) || ageNum <= 0 || !Number.isInteger(ageNum) || !Number.isFinite(heightNum) || heightNum <= 0 || !Number.isFinite(weightNum) || weightNum <= 0 || (goalNum !== undefined && (!Number.isFinite(goalNum) || goalNum <= 0))) return null;
    return { sex, age: ageNum, heightCm: heightNum, weightKg: weightNum, goalWeightKg: goalNum, activityFactor: Number(activityFactor) };
  }

  const parsed = parseProfile();
  const estimate = parsed ? calculateTarget(parsed, Number(activityFactor), Number(deficitRatio)) : null;
  const safety = parsed ? evaluateProfileSafety(parsed) : { blocked: false, reasons: [] as string[] };

  async function saveProfile() {
    if (!parsed) { setError("请输入有效的年龄、身高和体重。"); setSuccess(""); return; }
    if (parsed.age < 18) { setError("仅支持 18 周岁及以上成年人设置自动目标。"); setSuccess(""); return; }
    if (safety.blocked) { setError(safety.reasons.join(" ")); setSuccess(""); return; }
    try { await updateProfile(parsed); setError(""); setSuccess("资料已保存。"); }
    catch { setError("无法保存资料。"); setSuccess(""); }
  }

  async function recalculateTarget() {
    if (!parsed) { setError("请先填写有效的个人资料。"); setSuccess(""); return; }
    if (parsed.age < 18 || safety.blocked) { setError("资料未通过安全检查。"); setSuccess(""); return; }
    const result = calculateTarget(parsed, Number(activityFactor), Number(deficitRatio));
    if (result.requiresManualReview) { setError("目标低于估算静息能量或减脂速度过快。"); setSuccess(""); return; }
    try {
      const today = localDateKey(new Date());
      const p = Math.round(Number(proteinG)); const f = Math.round(Number(fatG));
      const remaining = result.targetCaloriesKcal - p * 4 - f * 9;
      const macros: MacroTargets = { proteinG: p, fatG: f, carbohydrateG: Math.max(0, Math.round(remaining / 4)) };
      await updateTarget(today, result.targetCaloriesKcal, macros);
      setCalories(String(Math.round(result.targetCaloriesKcal)));
      setProteinG(String(macros.proteinG)); setCarbohydrateG(String(macros.carbohydrateG)); setFatG(String(macros.fatG));
      setError(""); setSuccess("每日目标已重新计算并保存。");
    } catch { setError("无法保存目标。"); setSuccess(""); }
  }

  async function saveManualTarget() {
    const cal = Number(calories); const p = Number(proteinG); const c = Number(carbohydrateG); const f = Number(fatG);
    if (!Number.isFinite(cal) || cal <= 0 || !Number.isFinite(p) || p < 0 || !Number.isFinite(c) || c < 0 || !Number.isFinite(f) || f < 0) {
      setError("请输入有效的热量和营养素数值。"); setSuccess(""); return;
    }
    try { await updateTarget(localDateKey(new Date()), cal, { proteinG: p, carbohydrateG: c, fatG: f }); setError(""); setSuccess("每日目标已保存。"); }
    catch { setError("无法保存目标。"); setSuccess(""); }
  }

  return <section className="settings-workspace workspace-section" id="settings" aria-labelledby="settings-heading">
    <p className="eyebrow">设置</p>
    <h2 id="settings-heading">个人资料与目标</h2>
    <div className="settings-grid">
      <form className="workspace-card" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
        <h3>编辑个人资料</h3>
        <label>性别<select aria-label="性别" value={sex} onChange={(e) => setSex(e.target.value as UserProfile["sex"])}><option value="female">女</option><option value="male">男</option></select></label>
        <label>年龄<input aria-label="年龄" type="number" min="18" max="120" step="1" value={age} onChange={(e) => setAge(e.target.value)} /></label>
        <label>身高（厘米）<input aria-label="身高（厘米）" type="number" min="1" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} /></label>
        <label>体重（公斤）<input aria-label="体重（公斤）" type="number" min="1" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} /></label>
        <label>目标体重（公斤）<input aria-label="目标体重（公斤）" type="number" min="1" step="0.1" value={goalWeightKg} onChange={(e) => setGoalWeightKg(e.target.value)} /></label>
        <label>日常活动水平<select aria-label="日常活动水平" value={activityFactor} onChange={(e) => setActivityFactor(e.target.value)}>{ACTIVITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>减脂节奏<select aria-label="减脂节奏" value={deficitRatio} onChange={(e) => setDeficitRatio(e.target.value)}><option value="0">维持体重</option><option value="0.1">温和减脂</option><option value="0.15">稳步减脂</option><option value="0.25">较快减脂</option></select></label>
        {estimate && <section className="target-estimate" aria-live="polite"><p>预计每日热量：{Math.round(estimate.targetCaloriesKcal)} 千卡</p><p>预计维持热量：{Math.round(estimate.tdeeKcal)} 千卡</p><p>预计静息能量：{Math.round(estimate.bmrKcal)} 千卡</p>{estimate.warnings.map((w) => <p className="form-error" key={w}>{w}</p>)}</section>}
        <button className="primary-button" type="submit">保存资料</button>
      </form>
      <form className="workspace-card" onSubmit={(e) => { e.preventDefault(); void saveManualTarget(); }}>
        <h3>每日热量与营养素目标</h3>
        <p className="estimate-copy">修改资料后重新计算，或手动调整今日目标。</p>
        <label>目标每日热量（千卡）<input aria-label="目标每日热量（千卡）" type="number" min="0" step="1" value={calories} onChange={(e) => setCalories(e.target.value)} /></label>
        <label>目标蛋白质（g）<input aria-label="目标蛋白质（g）" type="number" min="0" step="0.1" value={proteinG} onChange={(e) => setProteinG(e.target.value)} /></label>
        <label>目标碳水化合物（g）<input aria-label="目标碳水化合物（g）" type="number" min="0" step="0.1" value={carbohydrateG} onChange={(e) => setCarbohydrateG(e.target.value)} /></label>
        <label>目标脂肪（g）<input aria-label="目标脂肪（g）" type="number" min="0" step="0.1" value={fatG} onChange={(e) => setFatG(e.target.value)} /></label>
        <div className="form-actions"><button type="button" onClick={() => void recalculateTarget()}>根据资料重新计算</button><button className="primary-button" type="submit">保存手动目标</button></div>
      </form>
    </div>
    {error && <p className="form-error" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
    {success && <p className="form-success" role="status">{success}</p>}
  </section>;
}