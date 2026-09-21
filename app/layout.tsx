import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "墨笺 · 小说写作工作台",
  description: "为有温度的小说创作而生的写作环境",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-serif text-ink antialiased">{children}</body>
    </html>
  );
}
