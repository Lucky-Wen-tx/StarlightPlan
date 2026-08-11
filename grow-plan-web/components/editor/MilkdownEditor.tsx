"use client";

/**
 * Milkdown（Crepe）所见即所得 Markdown 编辑器
 *
 * 核心职责（替代原 VditorEditor）：
 * 1. 通过 @milkdown/react 的 useEditor 初始化 Crepe 实例（WYSIWYG，全功能）
 * 2. markdownUpdated 监听中直接获取 Markdown → 同步到 zustand store
 * 3. 切换笔记时通过 replaceAll 加载新内容（对应 Vditor 的 setValue）
 * 4. 通过 useAutoSave 钩子实现防抖自动保存（逻辑未变）
 * 5. 可编辑状态通过 Crepe.setReadonly 控制（对应 Vditor 的 enable/disabled）
 * 6. 主题跟随应用 ThemeProvider —— 纯 CSS 变量驱动，无需 JS 同步
 *
 * 与 Vditor 版本的关键区别：
 * - Milkdown 同为 Markdown 原生（WYSIWYG），内容流转方式一致
 * - 暗色模式不再调用 setTheme，由 .dark .milkdown 的 CSS 变量覆盖实现
 * - 功能全开：选中浮动工具栏、斜杠菜单、表格、KaTeX 公式、代码高亮、图片
 */
import { useEffect, useRef } from "react";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
// Milkdown 主题样式：common 为基础组件样式聚合，frame 为亮色主题
// 暗色模式通过 milkdown-overrides.css 的 .dark .milkdown 变量覆盖实现
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
// 项目自定义样式覆写（必须排在官方 CSS 之后引入，确保覆盖生效）
import "./milkdown-overrides.css";
import { useNoteStore } from "@/store/useNoteStore";
import { useUiStore } from "@/store/useUiStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import { uploadImage } from "@/lib/api";
import StatusBar from "@/components/editor/StatusBar";
import OutlinePanel from "@/components/editor/OutlinePanel";

/**
 * Milkdown 编辑器内部组件
 * 仅在笔记已选中时渲染，负责完整的编辑体验
 */
function MilkdownEditor(): React.ReactElement {
  // ── 从 store 读取当前笔记状态 ───────────────────────────────
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const currentContent: string = useNoteStore((s) => s.currentContent);
  const setCurrentContent: (content: string) => void = useNoteStore(
    (s) => s.setCurrentContent,
  );

  // ── 防抖自动保存（内容变更后 1 秒自动保存到后端）───────────
  useAutoSave(currentId, currentContent);

  // ── 大纲面板开关 ─────────────────────────────────────────────
  const outlineOpen: boolean = useUiStore((s) => s.outlineOpen);

  // ── Refs ────────────────────────────────────────────────────
  /** Crepe 实例引用（用于 replaceAll / setReadonly） */
  const crepeRef = useRef<Crepe | null>(null);
  /** 编辑器滚动容器引用（供大纲面板定位标题时查询 DOM） */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /**
   * 加载内容中标记：防止 replaceAll 触发的 markdownUpdated 回调
   * 将加载内容误判为用户编辑。初始为 true，编辑器就绪后放开；
   * 切换笔记期间再次置为 true（与 Vditor 版本的守卫逻辑一致）。
   */
  const isLoadingRef = useRef<boolean>(true);
  /** 首挂载时的初始内容：作为 Crepe 的 defaultValue */
  const initialContentRef = useRef<string>(currentContent);
  /** 上一次渲染时的笔记 ID，用于检测笔记切换 */
  const prevNoteIdRef = useRef<string | null>(currentId);

  // ═══════════════════════════════════════════════════════════════
  // 初始化 Crepe 编辑器
  // 工厂函数接收 React 封装传入的挂载容器，返回 Crepe 实例；
  // 封装层会在内部调用 crepe.create()，并负责卸载时自动 destroy。
  // ═══════════════════════════════════════════════════════════════
  const { loading } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialContentRef.current,
      features: {
        // 协作光标：单用户应用用不到，关闭；其余功能保持默认全开
        [Crepe.Feature.Cursor]: false,
      },
      featureConfigs: {
        // 占位文案（同 Vditor 版本）
        [Crepe.Feature.Placeholder]: {
          text: "记录此刻的想法…",
          mode: "block",
        },
        // 图片上传：走后端存储（上传 → 返回完整 URL → 插入 Markdown）
        [Crepe.Feature.ImageBlock]: {
          onUpload: uploadImage,
        },
      },
    });

    // ── 内容输出回调：Crepe 直接输出 Markdown 字符串 ──────────
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (isLoadingRef.current) {
          return;
        }
        setCurrentContent(markdown);
      });
    });

    crepeRef.current = crepe;
    return crepe;
  });

  // ── 编辑器就绪状态（初始化完成前显示加载占位）───────────────
  // editorReady 是 loading 的派生状态：loading 为 false 即代表编辑器就绪。
  // 直接计算派生值，避免在 effect 中同步 setState 引发级联渲染
  // （ESLint 规则 react-hooks/set-state-in-effect，参考官方文档：
  //  https://react.dev/learn/you-might-not-need-an-effect）
  const editorReady: boolean = !loading;

  // ═══════════════════════════════════════════════════════════════
  // Effect：编辑器就绪后放开内容回写守卫
  // 就绪状态已由 editorReady 派生，此处仅重置 ref 守卫，不触发 setState
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!loading) {
      // 初始 content 已由 defaultValue 写入，就绪后放开守卫
      isLoadingRef.current = false;
    }
  }, [loading]);

  // ═══════════════════════════════════════════════════════════════
  // Effect：切换笔记时加载 Markdown 内容
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const crepe: Crepe | null = crepeRef.current;

    // 编辑器尚未就绪 / 无笔记选中 → 跳过
    if (!crepe || !editorReady || currentId === null) {
      return;
    }

    // 同一篇笔记（未发生切换）→ 跳过，避免重复加载
    if (prevNoteIdRef.current === currentId) {
      return;
    }

    // 记录新笔记 ID
    prevNoteIdRef.current = currentId;

    // replaceAll 会触发 markdownUpdated，用 isLoadingRef 屏蔽误回写
    isLoadingRef.current = true;
    try {
      crepe.editor.action(replaceAll(currentContent));
    } catch (err: unknown) {
      console.error("[MilkdownEditor] 切换笔记加载内容失败:", err);
    } finally {
      // 使用微任务延迟重置，确保任何异步回调都在守卫期间执行
      Promise.resolve().then((): void => {
        isLoadingRef.current = false;
      });
    }
  }, [currentId, currentContent, editorReady]);

  // ═══════════════════════════════════════════════════════════════
  // Effect：同步可编辑状态
  // 未选中笔记时置为只读，防止空内容误操作
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const crepe: Crepe | null = crepeRef.current;
    if (!crepe || !editorReady) {
      return;
    }
    crepe.setReadonly(currentId === null);
  }, [currentId, editorReady]);

  // ── 渲染 Milkdown 编辑器 ────────────────────────────────────
  // 注意：<Milkdown /> 必须始终渲染，useEditor 工厂依赖其挂载的容器
  return (
    <div className="h-full flex flex-col">
      {/* 编辑器区域：大纲面板以浮层形式盖在编辑器右侧上方，
          不挤压编辑器宽度（编辑器保持全宽）；overflow-hidden 裁剪
          滑出动画期间越界的面板，避免出现横向滚动条 */}
      <div
        className={`flex-1 relative min-h-0 overflow-hidden ${
          outlineOpen ? "outline-open" : ""
        }`}
      >
        {/* 编辑器主体：外层滚动容器填充 flex-1 父元素，避免 h-full 依赖显式父高度 */}
        <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto">
          <Milkdown />
        </div>

        {/* 加载覆盖层：Milkdown 就绪后自动隐藏 */}
        {!editorReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
            <p className="text-sm text-neutral-400 dark:text-neutral-500 select-none">
              编辑器正在赶来中...
            </p>
          </div>
        )}

        {/* 右侧大纲浮层：始终挂载以支持滑出动画，open 控制滑入/滑出；
            key 绑定笔记 ID，切换笔记时重置面板内部滚动位置 */}
        <OutlinePanel
          key={currentId}
          open={outlineOpen}
          scrollContainerRef={scrollContainerRef}
        />
      </div>

      {/* 底部状态栏 */}
      <StatusBar />
    </div>
  );
}

/**
 * 导出组件（含 MilkdownProvider）
 * useEditor / useInstance 依赖 Provider 上下文，故在此包裹；
 * 对外接口与原 VditorEditor 保持一致（app/page.tsx 直接渲染）。
 */
export default function MilkdownEditorWrapper(): React.ReactElement {
  return (
    <MilkdownProvider>
      <MilkdownEditor />
    </MilkdownProvider>
  );
}
