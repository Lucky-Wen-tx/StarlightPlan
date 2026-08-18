"use client";

/**
 * 图片灯箱触发 hook（事件委托）
 *
 * 在滚动容器上监听图片点击，命中 `<img>` 时返回其 src/alt 供灯箱展示。
 * 触发方式由调用方决定：
 * - 主编辑器：用 "dblclick"（双击）——ProseMirror 单击图片是节点选中
 *   行为（出现缩放手柄/操作按钮），双击放大可避免与编辑操作冲突。
 * - 只读预览：用 "click"（单击）。
 *
 * 过滤规则：
 * - 仅响应 <img> 元素本身，忽略图片块内部的缩放手柄、操作按钮与块手柄。
 * - 取 img.currentSrc（最终解析后的地址）优先，兜底 getAttribute("src")
 *   （兼容 data: base64 内嵌图片）。
 * - e.preventDefault()：预览中图片若被链接包裹时阻止跳转；编辑器内阻止
 *   选区扩散。
 */
import { useEffect, useState, type RefObject } from "react";

export interface LightboxState {
  src: string;
  alt?: string;
}

export function useImageLightbox(
  containerRef: RefObject<HTMLElement | null>,
  trigger: "dblclick" | "click",
): { lightbox: LightboxState | null; close: () => void } {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      if (!target) return;

      // 以图片块容器为准（块级 .milkdown-image-block / 行内 .milkdown-image-inline）。
      // 编辑模式下单击图片会被 ProseMirror 选中并浮现操作按钮，第二次单击
      // 可能落在 .operation 按钮上，closest("img") 会落空，故在容器内再查 img。
      const imageContainer = target.closest(
        ".milkdown-image-block, .milkdown-image-inline",
      );
      if (!imageContainer) return;

      // 忽略图片块自身的缩放手柄、操作按钮与块手柄，避免误触发
      if (
        target.closest(
          ".milkdown-image-block .operation, .milkdown-image-block .image-resize-handle, .milkdown-block-handle",
        )
      ) {
        return;
      }

      const img = imageContainer.querySelector("img");
      if (!img) return;
      const src = img.currentSrc || img.getAttribute("src");
      if (!src) return;

      e.preventDefault();
      setLightbox({ src, alt: img.getAttribute("alt") ?? undefined });
    };

    container.addEventListener(trigger, handler);
    return () => container.removeEventListener(trigger, handler);
  }, [containerRef, trigger]);

  return { lightbox, close: () => setLightbox(null) };
}
