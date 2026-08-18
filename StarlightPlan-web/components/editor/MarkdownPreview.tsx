"use client";

/**
 * 只读 Markdown 预览组件（基于 Milkdown Crepe）
 *
 * 用于回收站笔记等不可编辑场景的右侧渲染：
 * - 与编辑器同款 WYSIWYG 渲染效果（主题、代码高亮、图片、KaTeX 等）
 * - 完全只读：不注册 markdownUpdated 回调、不触发任何自动保存
 * - 内容通过 defaultValue 在挂载时一次性注入；
 *   切换不同内容时由父组件通过 key 强制重挂载，保证内容正确刷新
 */
import { useEffect, useRef } from "react";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Crepe } from "@milkdown/crepe";
// 与编辑器保持同款主题样式与自定义覆写，确保预览观感一致
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./milkdown-overrides.css";
import HeadingLabel from "@/components/editor/HeadingLabel";
import ImageLightbox from "@/components/common/ImageLightbox";
import { useImageLightbox } from "@/components/editor/useImageLightbox";

/**
 * 预览内容组件（需包裹在 MilkdownProvider 内使用）
 */
function MarkdownPreviewContent({
  content,
}: {
  content: string;
}): React.ReactElement {
  /** 挂载时的初始内容：作为 Crepe 的 defaultValue 一次性注入 */
  const initialContentRef = useRef<string>(content);
  /** Crepe 实例引用（就绪后用于 setReadonly） */
  const crepeRef = useRef<Crepe | null>(null);
  /** 预览滚动容器引用（供标题标识 / 图片灯箱事件委托） */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── 图片灯箱触发：只读预览用单击 ──────────────────────────
  const { lightbox, close } = useImageLightbox(scrollContainerRef, "click");

  // ── 初始化 Crepe 预览实例 ────────────────────────────────
  const { loading } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialContentRef.current,
      features: {
        // 协作光标：单用户应用用不到，关闭
        [Crepe.Feature.Cursor]: false,
        // 占位文案：预览场景不需要编辑提示，关闭
        [Crepe.Feature.Placeholder]: false,
      },
    });
    crepeRef.current = crepe;
    return crepe;
  });

  /** 编辑器就绪状态（loading 为 false 即代表就绪） */
  const editorReady: boolean = !loading;

  // ═══════════════════════════════════════════════════════════════
  // Effect：就绪后强制切为只读
  // 预览内容不可编辑，且仅展示不参与任何数据同步
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const crepe: Crepe | null = crepeRef.current;
    if (!crepe || !editorReady) {
      return;
    }
    crepe.setReadonly(true);
  }, [editorReady]);

  return (
    <div className="h-full flex flex-col">
      {/* 预览主体：外层滚动容器填充 flex-1 父元素，与编辑器布局一致 */}
      <div className="flex-1 relative">
        <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto">
          <Milkdown />
          {/* 标题 hover 层级标识（H1~H6，portal 到 body） */}
          <HeadingLabel containerRef={scrollContainerRef} />
        </div>

        {/* 加载覆盖层：Milkdown 就绪后自动隐藏 */}
        {!editorReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
            <p className="text-sm text-neutral-400 dark:text-neutral-500 select-none">
              加载中...
            </p>
          </div>
        )}
      </div>

      {/* 图片灯箱（单击放大，portal 到 body，z-[300]）；key=src 强制换图/重开时重挂载复位缩放 */}
      <ImageLightbox
        key={lightbox?.src ?? ""}
        open={!!lightbox}
        src={lightbox?.src ?? ""}
        alt={lightbox?.alt}
        onClose={close}
      />
    </div>
  );
}

/**
 * 导出组件（含 MilkdownProvider）
 * useEditor 依赖 Provider 上下文，故在此包裹。
 * 父组件使用 <MarkdownPreview key={noteId} content={...} /> 切换不同内容。
 */
export default function MarkdownPreview({
  content,
}: {
  content: string;
}): React.ReactElement {
  return (
    <MilkdownProvider>
      <MarkdownPreviewContent content={content} />
    </MilkdownProvider>
  );
}
