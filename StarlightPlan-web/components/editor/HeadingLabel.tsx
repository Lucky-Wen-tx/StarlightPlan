"use client";

/**
 * 标题 hover 层级标识（H1~H6）
 *
 * 背景：富文本渲染后标题层级（h1~h6）视觉上不易区分。本组件在鼠标
 * hover 到任意标题时，于标题行头（左侧 gutter）显示一个淡淡的圆角
 * 矩形徽标，内容为 H1~H6，离开或滚动出视口即隐藏。
 *
 * 为什么用 JS 覆盖层而不是 CSS ::before 伪元素：
 * - CSS 方案会把伪元素生成的 "H1" 文本一并带入框选复制内容（浏览器
 *   行为不一，Firefox 更明显），笔记应用复制正文是高频操作，不可接受。
 * - JS 徽标是独立于 ProseMirror DOM 的 <div>，不参与选中/复制。
 * - 用 getBoundingClientRect 视口坐标定位，与 .ProseMirror 内边距解耦，
 *   不随 Crepe 结构升级错位。
 *
 * 实现要点：
 * - createPortal 挂到 document.body，规避滚动容器（overflow-y-auto）
 *   对负坐标内容的裁剪。
 * - 事件委托：容器上监听 mouseover/mouseout，命中 h1~h6 才响应。
 * - 滚动/缩放窗口时重算位置；标题滚出视口即隐藏。
 * - 状态更新全部发生在事件处理器 / rAF 回调中（不触发
 *   react-hooks/set-state-in-effect），effect 仅负责注册与清理监听。
 * - 徽标 pointer-events: none，不抢占鼠标、不与 Crepe 块手柄冲突。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/** 徽标尺寸（px） */
const LABEL_W = 34;
const LABEL_H = 20;
/** 徽标右缘到标题左缘的间距（配合 .ProseMirror 100px 左内边距，徽标落入左 gutter） */
const LABEL_GAP = 64;

interface HeadingLabelProps {
  /** 编辑器/预览的滚动容器（absolute inset-0 overflow-y-auto 的 div） */
  containerRef: RefObject<HTMLElement | null>;
}

interface BadgeState {
  level: number;
  pos: { top: number; left: number } | null;
}

export default function HeadingLabel({
  containerRef,
}: HeadingLabelProps): React.ReactElement | null {
  /** 当前显示的徽标（null = 隐藏） */
  const [badge, setBadge] = useState<BadgeState | null>(null);
  /** 被 hover 的标题元素（供滚动重算时取实时坐标） */
  const elRef = useRef<HTMLElement | null>(null);
  /** 滚动/缩放重算的 rAF 节流标记 */
  const rafRef = useRef<number | null>(null);

  // ── 计算徽标视口坐标：标题滚出视口返回 null（隐藏）─────────
  const computePos = useCallback((el: HTMLElement): { top: number; left: number } | null => {
    const rect = el.getBoundingClientRect();
    // 上缘超出视口或完全滑到视口下方 → 不显示
    if (rect.top < 0 || rect.top > window.innerHeight) {
      return null;
    }
    return {
      top: rect.top + (rect.height - LABEL_H) / 2,
      left: rect.left - LABEL_GAP - LABEL_W,
    };
  }, []);

  // ── hover 进入标题：直接计算并显示（事件处理器，非 effect）──
  const handleMouseOver = useCallback(
    (e: MouseEvent): void => {
      const el = (e.target as Element).closest("h1,h2,h3,h4,h5,h6");
      if (!(el instanceof HTMLElement)) return;
      elRef.current = el;
      setBadge({ level: Number(el.tagName.charAt(1)), pos: computePos(el) });
    },
    [computePos],
  );

  // ── hover 离开标题区：隐藏；标题间移动不闪灭 ──────────────
  const handleMouseOut = useCallback((e: MouseEvent): void => {
    // 移入另一标题（relatedTarget 仍是标题）时不隐藏
    const related = e.relatedTarget as Element | null;
    if (related && related.closest("h1,h2,h3,h4,h5,h6")) {
      return;
    }
    elRef.current = null;
    setBadge(null);
  }, []);

  // ── 滚动/缩放重算位置（rAF 节流，状态更新在 rAF 回调内）────
  const scheduleReposition = useCallback(() => {
    const el = elRef.current;
    if (!el || rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pos = computePos(el);
      setBadge((prev) => (prev ? { ...prev, pos } : prev));
    });
  }, [computePos]);

  // ── 事件注册与清理：effect 内不做任何 setState ────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);
    container.addEventListener("scroll", scheduleReposition, { passive: true });
    window.addEventListener("resize", scheduleReposition);
    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
      container.removeEventListener("scroll", scheduleReposition);
      window.removeEventListener("resize", scheduleReposition);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerRef, handleMouseOver, handleMouseOut, scheduleReposition]);

  if (!badge || !badge.pos) {
    return null;
  }

  // 挂到 body：避开编辑区所有滚动容器与 overflow 裁剪；dark: 变体随 html.dark 生效
  return createPortal(
    <div
      className="fixed z-[60] pointer-events-none select-none flex items-center justify-center rounded-md text-[10px] font-medium tracking-wider text-neutral-500 dark:text-neutral-400 bg-neutral-200/80 dark:bg-neutral-700/80 border border-neutral-300/60 dark:border-neutral-600/60 backdrop-blur-sm"
      style={{ top: badge.pos.top, left: badge.pos.left, width: LABEL_W, height: LABEL_H }}
    >
      H{badge.level}
    </div>,
    document.body,
  );
}
