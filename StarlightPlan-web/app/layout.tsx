/**
 * 根布局组件
 * 三栏结构：顶部导航 + 左侧边栏 + 右侧主内容区
 *
 * 主题：通过 ThemeProvider 管理浅色/深色/跟随系统三种模式，
 * 内联脚本在 hydration 前设置 <html class="dark"> 防止闪烁。
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import ToastContainer from "@/components/common/ToastContainer";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾星Plan",
  description: "极简 Markdown 笔记应用",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 在 hydration 前同步读取 localStorage，防止深色模式闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100">
        <ThemeProvider>
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-neutral-50 dark:bg-neutral-950">
              {children}
            </main>
          </div>
          {/* 全局轻提示容器：统一渲染 Toast 错误反馈 */}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
