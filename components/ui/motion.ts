"use client";

import { useReducedMotion } from "framer-motion";

/**
 * 动画时长与缓动常量（遵循 web/AGENTS.md §4 与 ui-ux-pro-max 规则）：
 * - 微交互/按钮 150-300ms；弹窗、页面切换 300-500ms；超过 500ms 为反模式。
 * - 进入 ease-out，退出 ease-in 且退出快于进入。
 * 仅用 framer-motion，禁止引入第二个动画库。
 */

export const DUR = {
  micro: 0.15,
  fast: 0.18,
  base: 0.25,
  enter: 0.28,
  exit: 0.18,
} as const;

export const EASE = {
  out: [0.16, 1, 0.3, 1] as const,
  in: [0.7, 0, 0.84, 0] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

/**
 * 统一读取 prefers-reduced-motion。返回降级开关与可安全传给 motion 的
 * transition / initial 工厂。reduce 为 true 时所有动画降级为瞬时（duration 0），
 * 并避免位移/缩放，仅保留必要的透明度变化，符合无障碍规范。
 */
export function useMotionPref() {
  const reduce = useReducedMotion() ?? false;
  return {
    reduce,
    transition: (duration: number, ease: ReadonlyArray<number> = EASE.out) =>
      reduce ? { duration: 0 } : { duration, ease: ease as unknown as number[] },
    fadeOnly: reduce,
  };
}

/** 列表 stagger：reduce 时返回瞬时零位移。 */
export function staggerTransition(index: number) {
  const reduce = useReducedMotion() ?? false;
  if (reduce) return { duration: 0 };
  return { duration: DUR.enter, delay: Math.min(index, 8) * 0.04, ease: EASE.out as unknown as number[] };
}