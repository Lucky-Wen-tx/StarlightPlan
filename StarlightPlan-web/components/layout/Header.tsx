"use client";

/**
 * 顶部导航栏
 * - 左侧：应用标题「拾光Plan」
 * - 右侧：导入 / 导出 / 主题切换按钮
 *
 * 导入/导出说明：
 * - 导入：选择 .md 文件 → 调后端 /api/notes/import → 刷新列表并选中新笔记
 * - 导出：纯前端操作 —— 将当前笔记的 Markdown 字符串下载为 .md 文件，
 *   不经过后端（内容已在 store 中）
 */
import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Download, ListTree } from "lucide-react";
import ThemeToggle from "@/components/common/ThemeToggle";
import { useNoteStore } from "@/store/useNoteStore";
import { useUiStore } from "@/store/useUiStore";
import { useToastStore } from "@/store/useToastStore";
import { importMarkdown } from "@/lib/api";
import { buildPortableMarkdown } from "@/lib/exportMarkdown";

/** 与 ThemeToggle 一致的图标按钮样式，保证视觉统一 */
const ICON_BTN_CLASS =
  "cursor-pointer p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors";

export default function Header(): React.ReactElement {
  // ── store 状态：当前笔记信息 + 列表刷新/选中方法 ──────────────
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const currentTitle: string = useNoteStore((s) => s.currentTitle);
  const currentContent: string = useNoteStore((s) => s.currentContent);
  const fetchNoteList = useNoteStore((s) => s.fetchNoteList);
  const selectNote = useNoteStore((s) => s.selectNote);
  const showToast = useToastStore((s) => s.showToast);
  // ── 大纲面板开关（编辑器右侧目录）────────────────────────
  const outlineOpen: boolean = useUiStore((s) => s.outlineOpen);
  const toggleOutline = useUiStore((s) => s.toggleOutline);

  /** 隐藏的文件选择器（点击导入按钮时触发） */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 导出进行中标记：用于禁用按钮，防止重复点击与重复下载 */
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // ── 导入：打开文件选择器 ──────────────────────────────────
  const handleImportClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  // ── 导入：文件选择后上传后端并刷新列表 ────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file: File | undefined = e.target.files?.[0];
      // 先清空 input 值，保证再次选择同一文件也能触发 change
      e.target.value = "";
      if (!file) {
        return;
      }
      try {
        const detail = await importMarkdown(file);
        // 刷新列表并自动选中导入的笔记，让用户立刻看到导入结果
        await fetchNoteList();
        await selectNote(detail.id);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "导入失败，请稍后重试";
        showToast(message);
      }
    },
    [fetchNoteList, selectNote, showToast],
  );

  // ── 导出：将当前笔记下载为 .md 文件（纯前端）──────────────
  // 导出的内容会先把引用的后端图片转成 base64 内嵌，
  // 生成自包含文件 —— 换机器 / 发他人也能正常显示图片。
  const handleExport = useCallback(async (): Promise<void> => {
    if (currentId === null || isExporting) {
      return;
    }
    setIsExporting(true);
    try {
      // 下载引用的图片 → base64 内嵌，生成自包含 Markdown
      const portableContent: string =
        await buildPortableMarkdown(currentContent);

      // 标题清洗掉文件名非法字符（Windows/Linux 通用）
      const safeTitle: string =
        currentTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "note";
      const blob: Blob = new Blob([portableContent], {
        type: "text/markdown;charset=utf-8",
      });
      const url: string = URL.createObjectURL(blob);
      const link: HTMLAnchorElement = document.createElement("a");
      link.href = url;
      link.download = `${safeTitle}.md`;
      // 需挂载到文档中，Firefox 等浏览器才支持触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : "导出失败，请稍后重试";
      showToast(message);
    } finally {
      setIsExporting(false);
    }
  }, [currentId, currentTitle, currentContent, isExporting, showToast]);

  // 未选中笔记或正在导出时禁用导出按钮
  const exportDisabled: boolean = currentId === null || isExporting;
  // 未选中笔记时禁用大纲按钮（回收站视图会清空 currentId，同样禁用）
  const outlineDisabled: boolean = currentId === null;

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-white dark:bg-neutral-950 select-none relative z-10 after:absolute after:inset-x-0 after:top-full after:h-1 after:bg-gradient-to-b after:from-black/8 after:to-transparent dark:after:from-black/40">
      {/* 左侧：品牌标题 */}
      <div className="flex items-center gap-2.5">
        <Image
          src="/ico_index.png"
          alt="拾光"
          width={28}
          height={28}
          className="shrink-0"
          unoptimized
        />
        <span className="text-xl font-semibold tracking-wide text-neutral-800 dark:text-neutral-100">
          拾光Plan
        </span>
      </div>

      {/* 右侧：导入 / 导出 / 主题切换 */}
      <div className="flex items-center gap-2">
        {/* 隐藏的文件选择器：接受 .md / .markdown 文件 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 导入按钮 */}
        <button
          type="button"
          onClick={handleImportClick}
          title="导入 Markdown 笔记"
          aria-label="导入 Markdown 笔记"
          className={ICON_BTN_CLASS}
        >
          <Upload size={18} />
        </button>

        {/* 导出按钮（自包含导出：图片内嵌 base64） */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exportDisabled}
          title={
            isExporting
              ? "正在导出..."
              : exportDisabled
                ? "请先选择一篇笔记"
                : "导出当前笔记为 Markdown（图片内嵌，可独立使用）"
          }
          aria-label="导出当前笔记为 Markdown"
          className={`${ICON_BTN_CLASS} ${
            exportDisabled ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          {isExporting ? (
            <span className="inline-block w-[18px] text-center">…</span>
          ) : (
            <Download size={18} />
          )}
        </button>

        <ThemeToggle />

        {/* 大纲（目录）切换按钮：展开编辑器右侧大纲面板 */}
        <button
          type="button"
          onClick={toggleOutline}
          disabled={outlineDisabled}
          aria-pressed={outlineOpen}
          title={outlineDisabled ? "请先选择一篇笔记" : "切换目录大纲"}
          aria-label="切换目录大纲"
          className={`${ICON_BTN_CLASS} ${
            outlineDisabled ? "opacity-40 cursor-not-allowed" : ""
          } ${
            outlineOpen
              ? "text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800"
              : ""
          }`}
        >
          <ListTree size={18} />
        </button>
      </div>
    </header>
  );
}
