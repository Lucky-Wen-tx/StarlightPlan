"use client";

/**
 * 轻提示（Toast）容器
 *
 * 读取全局 Toast store，将所有提示渲染为固定在视口头部居中的卡片。
 * 样式：白色卡片 / 12px 圆角 / 柔和多层阴影 / 红色错误图标 / 下滑淡入动画。
 * 需在根布局挂载一次（layout.tsx），自动随 store 展示与消失。
 */
import { AlertCircle, CircleCheck } from "lucide-react";
import { useToastStore } from "@/store/useToastStore";

/** 柔和多层阴影（与侧栏悬浮菜单、模态框同款，保证视觉统一） */
const TOAST_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_8px_rgba(0,0,0,0.04),0_10px_20px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.25),0_12px_24px_-6px_rgba(0,0,0,0.4)]";

export default function ToastContainer(): React.ReactElement | null {
  const toasts = useToastStore((s) => s.toasts);

  // 没有提示时不渲染任何 DOM
  if (toasts.length === 0) {
    return null;
  }

  return (
    /* 容器：固定视口头部居中（顶栏 48px 下方，避免遮挡顶栏）；pointer-events-none 让空白区域不拦截点击 */
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-white dark:bg-neutral-800 text-sm text-neutral-700 dark:text-neutral-200 animate-toast-in ${TOAST_SHADOW}`}
        >
          {/* 成功提示：绿色对勾；错误提示：红色感叹号 */}
          {toast.type === "success" ? (
            <CircleCheck size={16} className="shrink-0 text-green-500" />
          ) : (
            <AlertCircle size={16} className="shrink-0 text-red-500" />
          )}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
