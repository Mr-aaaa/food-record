import type { ReactNode } from "react";

const desktopNavigation = ["今日", "记录", "趋势", "计划", "数据", "设置"];
const mobileNavigation = ["今日", "记录", "趋势", "计划", "我的"];

export default function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="app-brand" href="#today">每日营养</a>
        <nav aria-label="桌面导航" className="desktop-navigation">
          {desktopNavigation.map((item) => (
            <a href={item === "今日" ? "#today" : `#${item}`} key={item}>
              {item}
            </a>
          ))}
        </nav>
      </header>
      <main className="app-main">{children}</main>
      <nav aria-label="移动导航" className="mobile-navigation">
        {mobileNavigation.map((item) => (
          <a href={item === "今日" ? "#today" : `#${item}`} key={item}>
            {item}
          </a>
        ))}
      </nav>
    </div>
  );
}
