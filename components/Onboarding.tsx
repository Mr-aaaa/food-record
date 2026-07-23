"use client";

import { useState } from "react";
import { BUILT_IN_PLANS } from "@/data/plans";
import { applyPlan, calculateTarget } from "@/domain/energy";
import { localDateKey } from "@/domain/local-date";
import type { PlanDefinition, TargetResult, UserProfile } from "@/domain/types";
import { useAppStore } from "@/state/app-store";

type ProfileFields = {
  sex: UserProfile["sex"];
  age: string;
  heightCm: string;
  weightKg: string;
  goalWeightKg: string;
  activityFactor: string;
  deficitRatio: string;
};

type TargetEstimate = {
  profile: UserProfile;
  target: TargetResult;
};

const initialFields: ProfileFields = {
  sex: "female",
  age: "",
  heightCm: "",
  weightKg: "",
  goalWeightKg: "",
  activityFactor: "1.2",
  deficitRatio: "0.15",
};

const ADULT_ONLY_MESSAGE = "仅支持18周岁及以上成年人设置自动目标。";
const MANUAL_REVIEW_MESSAGE = "该目标低于估算静息能量，无法自动确认。请降低减脂速度或调整资料后重新计算。";

function asPositiveNumber(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseProfile(fields: ProfileFields): UserProfile | null {
  const age = asPositiveNumber(fields.age);
  const heightCm = asPositiveNumber(fields.heightCm);
  const weightKg = asPositiveNumber(fields.weightKg);
  const goalWeightKg = fields.goalWeightKg === "" ? undefined : asPositiveNumber(fields.goalWeightKg);

  if (!age || !heightCm || !weightKg || (fields.goalWeightKg !== "" && !goalWeightKg)) {
    return null;
  }

  return { sex: fields.sex, age, heightCm, weightKg, goalWeightKg };
}

export default function Onboarding() {
  const { completeOnboarding } = useAppStore();
  const [fields, setFields] = useState<ProfileFields>(initialFields);
  const [estimate, setEstimate] = useState<TargetEstimate | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedPlan = BUILT_IN_PLANS.find((plan) => plan.id === selectedPlanId) as PlanDefinition | undefined;

  function updateField<Key extends keyof ProfileFields>(key: Key, value: ProfileFields[Key]) {
    setFields((current) => ({ ...current, [key]: value }));
    setEstimate(null);
    setError("");
  }

  function calculate() {
    const profile = parseProfile(fields);
    const activityFactor = asPositiveNumber(fields.activityFactor);
    const deficitRatio = Number(fields.deficitRatio);

    if (!profile || !activityFactor || !Number.isFinite(deficitRatio) || deficitRatio < 0) {
      setEstimate(null);
      setError("请填写有效的年龄、身高和体重后再计算。");
      return;
    }

    if (profile.age < 18) {
      setEstimate(null);
      setError(ADULT_ONLY_MESSAGE);
      return;
    }

    setEstimate({ profile, target: calculateTarget(profile, activityFactor, deficitRatio) });
    setError("");
  }

  async function confirm() {
    if (!estimate || !selectedPlan || estimate.target.requiresManualReview) {
      if (estimate?.target.requiresManualReview) {
        setError(MANUAL_REVIEW_MESSAGE);
        return;
      }
      setError("请先计算目标并选择一个饮食计划。");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await completeOnboarding({
        profile: estimate.profile,
        plan: selectedPlan,
        target: {
          calculationDate: localDateKey(new Date()),
          sourceProfile: { ...estimate.profile },
          target: estimate.target,
          macroTargets: applyPlan(estimate.target.targetCaloriesKcal, estimate.profile.weightKg, selectedPlan),
          planId: selectedPlan.id,
        },
      });
    } catch {
      setError("暂时无法保存你的目标，请稍后重试。");
      setIsSaving(false);
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <p className="eyebrow">开始使用</p>
        <h1 id="onboarding-title">设置你的目标</h1>
        <p className="intro">先用基础资料生成每日能量和宏量营养素的参考值。</p>

        <div className="profile-grid">
          <label>
            性别
            <select aria-label="性别" value={fields.sex} onChange={(event) => updateField("sex", event.target.value as UserProfile["sex"])}>
              <option value="female">女</option>
              <option value="male">男</option>
            </select>
          </label>
          <label>
            年龄
            <input aria-label="年龄" inputMode="numeric" min="1" onChange={(event) => updateField("age", event.target.value)} type="number" value={fields.age} />
          </label>
          <label>
            身高（厘米）
            <input aria-label="身高（厘米）" inputMode="decimal" min="1" onChange={(event) => updateField("heightCm", event.target.value)} type="number" value={fields.heightCm} />
          </label>
          <label>
            体重（千克）
            <input aria-label="体重（千克）" inputMode="decimal" min="1" onChange={(event) => updateField("weightKg", event.target.value)} type="number" value={fields.weightKg} />
          </label>
          <label>
            目标体重（可选，千克）
            <input aria-label="目标体重（可选，千克）" inputMode="decimal" min="1" onChange={(event) => updateField("goalWeightKg", event.target.value)} type="number" value={fields.goalWeightKg} />
          </label>
          <label>
            日常活动水平
            <select aria-label="日常活动水平" value={fields.activityFactor} onChange={(event) => updateField("activityFactor", event.target.value)}>
              <option value="1.2">久坐或轻体力活动</option>
              <option value="1.375">轻度活动</option>
              <option value="1.55">中等活动</option>
              <option value="1.725">高活动量</option>
            </select>
          </label>
          <label>
            目标节奏
            <select aria-label="目标节奏" value={fields.deficitRatio} onChange={(event) => updateField("deficitRatio", event.target.value)}>
              <option value="0">维持体重</option>
              <option value="0.1">温和减脂</option>
              <option value="0.15">稳步减脂</option>
              <option value="0.25">较快减脂</option>
            </select>
          </label>
        </div>

        <button className="primary-button" onClick={calculate} type="button">计算目标</button>
        {error && <p className="form-error" role="alert">{error}</p>}

        {estimate && (
          <section className="target-estimate" aria-live="polite">
            <h2>预计每日热量</h2>
            <p className="target-number">{Math.round(estimate.target.targetCaloriesKcal)} 千卡</p>
            <p>预计维持热量：{Math.round(estimate.target.tdeeKcal)} 千卡</p>
            <p>静息能量估算：{Math.round(estimate.target.bmrKcal)} 千卡</p>
            <p className="estimate-copy">这是一项基于资料的估算，实际需求会随活动和身体状况变化。</p>
            <p className="risk-copy">如有疾病管理、孕哺期或饮食困扰，请先咨询专业人士。</p>
            {estimate.target.requiresManualReview && <p className="form-error" role="alert">{MANUAL_REVIEW_MESSAGE}</p>}
            {estimate.target.warnings.map((warning) => <p className="form-error" key={warning}>{warning}</p>)}

            <fieldset className="plan-options">
              <legend>选择饮食计划</legend>
              {BUILT_IN_PLANS.map((plan) => (
                <label className="plan-option" key={plan.id}>
                  <input aria-label={plan.name} checked={selectedPlanId === plan.id} name="plan" onChange={() => setSelectedPlanId(plan.id)} type="radio" value={plan.id} />
                  <span>
                    <strong>{plan.name}</strong>
                    <small>{plan.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <button className="primary-button" disabled={!selectedPlan || isSaving || estimate.target.requiresManualReview} onClick={confirm} type="button">
              {isSaving ? "正在保存…" : "确认并开始记录"}
            </button>
          </section>
        )}
      </section>
    </main>
  );
}
