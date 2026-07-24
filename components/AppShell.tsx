import type { ReactNode } from "react";

export type ViewName = "today" | "record" | "trends" | "plans" | "data" | "settings";

const desktopNavigation: readonly [ViewName, string][] = [
  ["today", "今日"], ["record", "记录"], ["trends", "趋势"], ["plans", "计划"], ["data", "数据"], ["settings", "设置"],
];
const mobileNavigation: readonly [ViewName, string][] = [
  ["today", "今日"], ["record", "记录"], ["trends", "趋势"], ["plans", "计划"], ["settings", "我的"],
];

interface AppShellProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
  children: ReactNode;
}

export default function AppShell({ currentView, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{"跳至主要内容"}</a>
      <header className="app-header">
        <a className="app-brand" href="#" onClick={(e) => { e.preventDefault(); onNavigate("today"); }}>{"每日营养"}</a>
        <nav aria-label={"桌面导航"} className="desktop-navigation">
          {desktopNavigation.map(([view, label]) => (
            <button key={view} type="button" className={currentView === view ? "nav-item active" : "nav-item"} aria-current={currentView === view ? "page" : undefined} onClick={() => onNavigate(view)}>{label}</button>
          ))}
        </nav>
      </header>
      <main className="app-main" id="main-content" tabIndex={-1}>{children}</main>
      <nav aria-label={"移动导航"} className="mobile-navigation">
        {mobileNavigation.map(([view, label]) => (
          <button key={view} type="button" className={currentView === view ? "nav-item active" : "nav-item"} aria-current={currentView === view ? "page" : undefined} onClick={() => onNavigate(view)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
