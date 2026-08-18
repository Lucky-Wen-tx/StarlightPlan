"use client";

/**
 * 通用图片灯箱（Lightbox）
 *
 * 点击/双击图片后放大查看大图，支持缩放与平移：
 * - 滚轮缩放（以图片中心为锚，阻止页面滚动）
 * - 底部工具栏 + / - 按钮、重置回 100%；双击图片在 100% ↔ 200% 切换
 * - 放大后拖拽平移（仅 scale>1 时有意义）
 * - ESC 或点击遮罩空白处关闭；点图片/工具栏不关闭
 *
 * 实现要点：
 * - createPortal 挂到 document.body，z-[300] 高于编辑器内部一切浮层
 *   （选中工具栏、块手柄、大纲面板），彻底规避滚动容器裁剪与层级问题。
 * - 缩放/平移为组件本地 state；src 变化（同文档换图）时自动复位。
 * - transform 不设 transition 保证拖拽跟手；入场动画 animate-panel-in 随
 *   globals.css 的 @theme 定义生效。
 * - 黑色遮罩在深浅主题下观感一致，天然兼容暗色模式。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";

/** 缩放上下限（倍率） */
const MIN_SCALE = 0.25;
const MAX_SCALE = 6;

interface ImageLightboxProps {
  /** 是否显示 */
  open: boolean;
  /** 大图地址（支持 data: base64 内嵌） */
  src: string;
  /** 图片替代文本 */
  alt?: string;
  /** 关闭回调（ESC / 点击遮罩空白触发） */
  onClose: () => void;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export default function ImageLightbox({
  open,
  src,
  alt,
  onClose,
}: ImageLightboxProps): React.ReactElement | null {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  // 缩放/平移复位由父组件通过 key={src} 强制重挂载实现（换图/重开即复位），
  // 故无需在 effect 中同步 setState。
  /** 拖拽起点与拖拽前偏移 */
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  /** 是否发生实际拖拽（用于区分「点空白关闭」与「拖拽后松开」） */
  const movedRef = useRef(false);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 滚轮缩放：原生非被动监听 + preventDefault，阻止页面滚动
  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // 指数映射：向上滚放大、向下滚缩小，手感平滑
      const factor = Math.exp(-e.deltaY * 0.0015);
      setScale((s) => clampScale(s * factor));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [open]);

  if (!open) {
    return null;
  }

  const zoomBy = (factor: number): void => {
    setScale((s) => clampScale(s * factor));
  };

  // ── 拖拽平移（pointer 事件，统一鼠标/触屏）──────────────
  const handlePointerDown = (e: React.PointerEvent): void => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: translate.x,
      originY: translate.y,
    };
    movedRef.current = false;
  };
  const handlePointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    // 位移超过阈值才算拖拽（用于区分点击）
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) {
      movedRef.current = true;
    }
    setTranslate({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  };
  const handlePointerUp = (): void => {
    dragRef.current = null;
  };

  // 点击遮罩空白关闭；点图片/工具栏或拖拽后的松开不关闭
  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target !== e.currentTarget) return;
    if (movedRef.current) return;
    onClose();
  };

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 animate-overlay-in select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 舞台：点击空白处关闭（e.target 需为舞台自身） */}
      <div
        className="absolute inset-0 p-6 flex items-center justify-center overflow-hidden cursor-default"
        onClick={handleBackdropClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 灯箱需展示任意 src（含 data: base64 内嵌图），next/image 不支持，故用原生 img */}
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="max-w-full max-h-full object-contain animate-panel-in"
          onDoubleClick={() => setScale((s) => (s === 1 ? 2 : 1))}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            cursor: scale > 1 ? "grab" : "default",
          }}
        />
      </div>

      {/* 右上角关闭按钮 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X size={18} />
      </button>

      {/* 底部缩放工具栏 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/10 text-white backdrop-blur-sm">
        <button
          type="button"
          aria-label="缩小"
          onClick={() => zoomBy(1 / 1.25)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"
        >
          <ZoomOut size={16} />
        </button>
        <span className="w-12 text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          aria-label="放大"
          onClick={() => zoomBy(1.25)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          aria-label="重置缩放"
          onClick={() => {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
