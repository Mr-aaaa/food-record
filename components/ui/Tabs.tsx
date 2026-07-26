"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { DUR, EASE, useMotionPref } from "@/components/ui/motion";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  /** 列表容器 className，便于复用 record-grid。 */
  className?: string;
  /** aria-label for the tablist. */
  label: string;
}

/**
 * ARIA Tabs：tablist/tab/tabpanel，非激活面板用 hidden 隐藏（正确 a11y）。
 * 面板切换 250ms ease-out 淡入+上移；reduced-motion 降级为瞬时。
 */
export default function Tabs({ tabs, defaultTab, className, label }: Readonly<TabsProps>) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const { reduce } = useMotionPref();
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === active));

  return (
    <div className={className}>
      <div className="tab-list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "tab-trigger is-active" : "tab-trigger"}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") { event.preventDefault(); tabs[Math.min(index + 1, tabs.length - 1)] && setActive(tabs[Math.min(index + 1, tabs.length - 1)].id); }
                else if (event.key === "ArrowLeft") { event.preventDefault(); tabs[Math.max(index - 1, 0)] && setActive(tabs[Math.max(index - 1, 0)].id); }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <motion.div
        key={active}
        className="tab-panel"
        role="tabpanel"
        id={`tabpanel-${active}`}
        aria-labelledby={`tab-${active}`}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: DUR.base, ease: EASE.out as unknown as number[] }}
      >
        {tabs[activeIndex]?.content}
      </motion.div>
    </div>
  );
}