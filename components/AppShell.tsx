import type { ReactNode } from "react";

const desktopNavigation = [
  ["今日", "#today"], ["记录", "#record"], ["趋势", "#trends"], ["计划", "#plans"], ["数据", "#data"], ["设置", "#settings"],
] as const;
const mobileNavigation = [
  ["今日", "#today"], ["记录", "#record"], ["趋势", "#trends"], ["计划", "#plans"], ["我的", "#settings"],
] as const;

export default function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要内容</a>
    <header className="app-header"><a className="app-brand" href="#today">每日营养</a>
      <nav aria-label="桌面导航" className="desktop-navigation">{desktopNavigation.map(([label, href]) => <a href={href} key={label}>{label}</a>)}</nav>
    </header>
    <main className="app-main" id="main-content" tabIndex={-1}>{children}</main>
    <nav aria-label="移动导航" className="mobile-navigation">{mobileNavigation.map(([label, href]) => <a href={href} key={label}>{label}</a>)}</nav>
  </div>;
}
