"use client";

/**
 * 通用基础模态框
 *
 * 视觉规范（两套弹窗共用，详见需求）：
 * - 全屏半透明黑色遮罩层 rgba(0,0,0,0.45)，点击遮罩关闭
 * - 弹窗页面居中、白色背景、12px 圆角、柔和多层阴影，无右上角关闭叉号
 * - 按 ESC 或点击遮罩关闭；打开时有淡入缩放动画（animate-overlay-in / animate-panel-in）
 *
 * 焦点管理：
 * - 面板自身可聚焦（tabIndex=-1），避免焦点丢失到 body
 * - 挂载时记录打开前的聚焦元素，卸载时还原
 *
 * 具体弹窗（InputDialog / ConfirmDialog）通过 title / children / footer 组合复用。
 */
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  /** 是否显示弹窗（false 时不渲染任何内容） */
  open: boolean;
  /** 弹窗标题（同时作为无障碍 aria-label） */
  title: string;
  /** 关闭回调（点击遮罩 / 按 ESC 触发） */
  onClose: () => void;
  /** 弹窗主体内容 */
  children: ReactNode;
  /** 底部按钮区（靠右对齐，由具体弹窗传入按钮） */
  footer: ReactNode;
}

/** 柔和多层阴影（与侧栏悬浮菜单同款，保证视觉统一） */
const PANEL_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_8px_rgba(0,0,0,0.04),0_10px_20px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.25),0_12px_24px_-6px_rgba(0,0,0,0.4)]";

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: ModalProps): React.ReactElement | null {
  /** 记录打开弹窗前聚焦的元素，关闭后还原，避免焦点丢失 */
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── 打开时记录焦点 / 关闭（卸载）时还原焦点 ────────────────
  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      // 弹窗关闭后把焦点还给打开前的元素
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // ── 按 ESC 关闭 ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // 关闭状态不渲染任何 DOM
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* ── 全屏半透明遮罩层：点击关闭 ── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 animate-overlay-in"
      />

      {/* ── 居中弹窗面板：白底 / 12px 圆角 / 柔和阴影 / 无右上角关闭叉号 ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full max-w-[400px] rounded-[12px] bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none animate-panel-in ${PANEL_SHADOW}`}
      >
        {/* 标题区 */}
        <h2 className="px-6 pt-5 pb-1 text-base font-semibold">{title}</h2>
        {/* 主体内容 */}
        <div className="px-6 py-3">{children}</div>
        {/* 底部按钮区（靠右） */}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2">{footer}</div>
      </div>
    </div>
  );
}
