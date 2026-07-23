import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "每日营养｜本地食物热量记录",
  description: "在浏览器本地记录每日饮食、营养目标与身体趋势。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
