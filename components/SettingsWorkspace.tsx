"use client";

import { useEffect, useRef, useState } from "react";
import { calculateBmr, calculateTarget, calculateTdee, evaluateProfileSafety } from "@/domain/energy";
import { localDateKey } from "@/domain/local-date";
import type { MacroTargets, UserProfile } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

const ACTIVITY_OPTIONS: [string, string][] = [
  ["1.2", "Sedentary"],
  ["1.375", "Lightly active"],
  ["1.55", "Moderately active"],
  ["1.725", "Very active"],
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
    if (!parsed) { setError("Enter valid age, height, and weight."); setSuccess(""); return; }
    if (parsed.age < 18) { setError("Only adults 18 and older can set automatic targets."); setSuccess(""); return; }
    if (safety.blocked) { setError(safety.reasons.join(" ")); setSuccess(""); return; }
    try { await updateProfile(parsed); setError(""); setSuccess("Profile saved."); }
    catch { setError("Could not save profile."); setSuccess(""); }
  }

  async function recalculateTarget() {
    if (!parsed) { setError("Enter a valid profile first."); setSuccess(""); return; }
    if (parsed.age < 18 || safety.blocked) { setError("Profile did not pass safety checks."); setSuccess(""); return; }
    const result = calculateTarget(parsed, Number(activityFactor), Number(deficitRatio));
    if (result.requiresManualReview) { setError("Target is below estimated BMR or deficit is too aggressive."); setSuccess(""); return; }
    try {
      const today = localDateKey(new Date());
      const p = Math.round(Number(proteinG)); const f = Math.round(Number(fatG));
      const remaining = result.targetCaloriesKcal - p * 4 - f * 9;
      const macros: MacroTargets = { proteinG: p, fatG: f, carbohydrateG: Math.max(0, Math.round(remaining / 4)) };
      await updateTarget(today, result.targetCaloriesKcal, macros);
      setCalories(String(Math.round(result.targetCaloriesKcal)));
      setProteinG(String(macros.proteinG)); setCarbohydrateG(String(macros.carbohydrateG)); setFatG(String(macros.fatG));
      setError(""); setSuccess("Daily target recalculated and saved.");
    } catch { setError("Could not save target."); setSuccess(""); }
  }

  async function saveManualTarget() {
    const cal = Number(calories); const p = Number(proteinG); const c = Number(carbohydrateG); const f = Number(fatG);
    if (!Number.isFinite(cal) || cal <= 0 || !Number.isFinite(p) || p < 0 || !Number.isFinite(c) || c < 0 || !Number.isFinite(f) || f < 0) {
      setError("Enter valid calorie and macro values."); setSuccess(""); return;
    }
    try { await updateTarget(localDateKey(new Date()), cal, { proteinG: p, carbohydrateG: c, fatG: f }); setError(""); setSuccess("Daily target saved."); }
    catch { setError("Could not save target."); setSuccess(""); }
  }

  return <section className="settings-workspace workspace-section" id="settings" aria-labelledby="settings-heading">
    <p className="eyebrow">Settings</p>
    <h2 id="settings-heading">Profile and targets</h2>
    <div className="settings-grid">
      <form className="workspace-card" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
        <h3>Edit profile</h3>
        <label>Profile sex<select aria-label="Profile sex" value={sex} onChange={(e) => setSex(e.target.value as UserProfile["sex"])}><option value="female">Female</option><option value="male">Male</option></select></label>
        <label>Profile age<input aria-label="Profile age" type="number" min="18" max="120" step="1" value={age} onChange={(e) => setAge(e.target.value)} /></label>
        <label>Profile height (cm)<input aria-label="Profile height (cm)" type="number" min="1" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} /></label>
        <label>Profile weight (kg)<input aria-label="Profile weight (kg)" type="number" min="1" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} /></label>
        <label>Profile goal weight (kg)<input aria-label="Profile goal weight (kg)" type="number" min="1" step="0.1" value={goalWeightKg} onChange={(e) => setGoalWeightKg(e.target.value)} /></label>
        <label>Profile activity level<select aria-label="Profile activity level" value={activityFactor} onChange={(e) => setActivityFactor(e.target.value)}>{ACTIVITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Profile deficit<select aria-label="Profile deficit" value={deficitRatio} onChange={(e) => setDeficitRatio(e.target.value)}><option value="0">Maintain</option><option value="0.1">Mild</option><option value="0.15">Steady</option><option value="0.25">Aggressive</option></select></label>
        {estimate && <section className="target-estimate" aria-live="polite"><p>Estimated daily calories: {Math.round(estimate.targetCaloriesKcal)} kcal</p><p>Estimated maintenance: {Math.round(estimate.tdeeKcal)} kcal</p><p>Estimated BMR: {Math.round(estimate.bmrKcal)} kcal</p>{estimate.warnings.map((w) => <p className="form-error" key={w}>{w}</p>)}</section>}
        <button className="primary-button" type="submit">Save profile</button>
      </form>
      <form className="workspace-card" onSubmit={(e) => { e.preventDefault(); void saveManualTarget(); }}>
        <h3>Daily calorie and macro targets</h3>
        <p className="estimate-copy">Recalculate after changing your profile, or adjust today manually.</p>
        <label>Target daily calories (kcal)<input aria-label="Target daily calories (kcal)" type="number" min="0" step="1" value={calories} onChange={(e) => setCalories(e.target.value)} /></label>
        <label>Target protein (g)<input aria-label="Target protein (g)" type="number" min="0" step="0.1" value={proteinG} onChange={(e) => setProteinG(e.target.value)} /></label>
        <label>Target carbohydrate (g)<input aria-label="Target carbohydrate (g)" type="number" min="0" step="0.1" value={carbohydrateG} onChange={(e) => setCarbohydrateG(e.target.value)} /></label>
        <label>Target fat (g)<input aria-label="Target fat (g)" type="number" min="0" step="0.1" value={fatG} onChange={(e) => setFatG(e.target.value)} /></label>
        <div className="form-actions"><button type="button" onClick={() => void recalculateTarget()}>Recalculate from profile</button><button className="primary-button" type="submit">Save manual target</button></div>
      </form>
    </div>
    {error && <p className="form-error" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
    {success && <p className="form-success" role="status">{success}</p>}
  </section>;
}