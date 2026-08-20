"use client";

/**
 * 设置弹窗（仿 deepseek harness webUI）
 *
 * 布局（三栏）：
 * - 头部：左侧「设置」标题 + 右侧关闭按钮
 * - 主体左右两栏：左=选项列表（通用设置 / 回收站），右=对应内容面板
 *
 * 通用设置面板：外观三选一（浅色 / 深色 / 跟随系统），图标在上、文字在下，
 *   复用 useTheme() 的 mode / setMode（ThemeProvider 负责写 localStorage 与 <html class="dark"> 切换）
 * 回收站面板：搜索框（按标题前端过滤）+ 已删除笔记列表；
 *   - 每条右侧带绿色圆角「恢复」按钮（单篇恢复，走 useRecycleStore.restoreOne）
 *   - 点击笔记条目 → enter() 进入原回收站视图 + selectNote() 在右侧渲染该笔记
 *
 * 实现方式：仿 ImageLightbox 先例自包含（createPortal 到 document.body + 遮罩 + ESC + 焦点管理），
 * 不复用通用 Modal（其固定 400px 宽 / 必填 footer 不适用于本大尺寸面板）。
 * z-index 用 z-[100]（与 Modal 一致），保证全局 Toast（z-[200]）在弹窗之上可见。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  SlidersHorizontal,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Search,
  FileText,
  RotateCcw,
} from "lucide-react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useRecycleStore } from "@/store/useRecycleStore";
import { useToastStore } from "@/store/useToastStore";
import type { NoteItem } from "@/types/note";
import { formatDate } from "@/lib/format";
import ScrollableTitle from "@/components/common/ScrollableTitle";

/** 柔和多层阴影（与侧栏悬浮菜单、模态框同款，保证视觉统一） */
const PANEL_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_8px_rgba(0,0,0,0.04),0_10px_20px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.25),0_12px_24px_-6px_rgba(0,0,0,0.4)]";

/** 图标按钮样式（与 Header / ThemeToggle 同款） */
const ICON_BTN_CLASS =
  "cursor-pointer p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors";

/** 弹窗内可切换的 Tab 类型 */
type SettingsTab = "general" | "recycle";

/** 左侧选项列表（图标 + 标签） */
const TAB_ITEMS: { key: SettingsTab; label: string; Icon: typeof SlidersHorizontal }[] = [
  { key: "general", label: "通用设置", Icon: SlidersHorizontal },
  { key: "recycle", label: "回收站", Icon: Trash2 },
];

/** 外观三选一选项（图标在上、文字在下） */
const THEME_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "浅色", Icon: Sun },
  { mode: "dark", label: "深色", Icon: Moon },
  { mode: "system", label: "跟随系统", Icon: Monitor },
];

interface SettingsDialogProps {
  /** 是否显示弹窗（false 时不渲染任何内容） */
  open: boolean;
  /** 关闭回调（点遮罩 / 按 ESC / 点关闭按钮触发） */
  onClose: () => void;
}

export default function SettingsDialog({
  open,
  onClose,
}: SettingsDialogProps): React.ReactElement | null {
  // ── 复用主题与回收站 store ────────────────────────────────
  const { mode, setMode } = useTheme();
  const recycleList: NoteItem[] = useRecycleStore((s) => s.recycleList);
  const fetchList = useRecycleStore((s) => s.fetchList);
  const enterRecycle = useRecycleStore((s) => s.enter);
  const selectRecycleNote = useRecycleStore((s) => s.selectNote);
  const restoreOne = useRecycleStore((s) => s.restoreOne);
  const showToast = useToastStore((s) => s.showToast);

  // ── 本地状态 ──────────────────────────────────────────────
  /** 当前激活的 Tab */
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  /** 回收站面板的搜索关键词 */
  const [searchQuery, setSearchQuery] = useState<string>("");
  /** 鼠标悬停的回收站条目 ID（驱动标题走马灯） */
  const [hoverRowNoteId, setHoverRowNoteId] = useState<string | null>(null);

  /** 面板 DOM 引用：打开时聚焦，避免焦点掉到 body */
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** 记录打开弹窗前聚焦的元素，关闭后还原焦点 */
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── 打开时：记录/还原焦点 + 聚焦面板 + 刷新回收站列表 ─────
  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();
    // 打开弹窗即刷新回收站列表，保证数据新鲜（失败静默，列表显示空态）
    fetchList().catch(() => {
      /* 忽略：仅影响回收站列表展示，不打断弹窗操作 */
    });
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open, fetchList]);

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

  // ── 是否处于搜索状态（有非空关键词） ───────────────────────
  const isSearching: boolean = searchQuery.trim().length > 0;

  // ── 前端实时过滤：按标题模糊匹配回收站笔记 ────────────────
  const filteredList = useMemo<NoteItem[]>(() => {
    if (!isSearching) {
      return recycleList;
    }
    const keyword = searchQuery.trim().toLowerCase();
    return recycleList.filter((note) =>
      note.title.toLowerCase().includes(keyword),
    );
  }, [recycleList, searchQuery, isSearching]);

  // ── 点击回收站笔记 → 进入原回收站视图并渲染该笔记 ─────────
  const handleOpenRecycleNote = useCallback(
    async (note: NoteItem): Promise<void> => {
      try {
        // 顺序不能颠倒：enter() 会先清空 currentRecycleId，
        // 必须再 selectNote(id) 才让右侧读到目标笔记并渲染只读预览
        await enterRecycle();
        await selectRecycleNote(note.id);
        onClose();
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "打开回收站失败，请稍后重试";
        showToast(message);
      }
    },
    [enterRecycle, selectRecycleNote, onClose, showToast],
  );

  // ── 恢复单篇笔记 ───────────────────────────────────────────
  const handleRestoreOne = useCallback(
    async (note: NoteItem): Promise<void> => {
      try {
        await restoreOne(note.id);
        showToast("已恢复到笔记列表", "success");
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "恢复笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [restoreOne, showToast],
  );

  // ── 切换 Tab：同时清空搜索词，避免跨面板残留过滤 ──────────
  const handleTab = useCallback((tab: SettingsTab): void => {
    setActiveTab(tab);
    setSearchQuery("");
  }, []);

  // 关闭状态不渲染任何 DOM
  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* ── 全屏半透明遮罩层：点击关闭 ── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 animate-overlay-in"
      />

      {/* ── 居中弹窗面板：800×700、24px 圆角、头部 + 左右两栏 ── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        tabIndex={-1}
        className={`relative w-[800px] max-w-full h-[700px] max-h-[90vh] flex flex-col rounded-[24px] bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none animate-panel-in ${PANEL_SHADOW}`}
      >
        {/* 头部：标题 + 关闭按钮 */}
        <div className="shrink-0 flex items-center justify-between pl-6 pr-4 pt-4 pb-3 select-none">
          <h2 className="text-base font-semibold">设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className={ICON_BTN_CLASS}
          >
            <X size={18} />
          </button>
        </div>

        {/* 主体：左选项列表 + 右内容区 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左栏：选项列表（通用设置 / 回收站） */}
          <nav className="shrink-0 w-48 border-t border-r border-neutral-100 dark:border-neutral-800 p-2 space-y-0.5">
            {TAB_ITEMS.map(({ key, label, Icon }) => {
              const isActive: boolean = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTab(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 font-medium"
                      : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* 右栏：内容区（可滚动） */}
          <div className="flex-1 min-w-0 border-t border-neutral-100 dark:border-neutral-800 overflow-y-auto p-6">
            {activeTab === "general" ? (
              <GeneralPanel mode={mode} setMode={setMode} />
            ) : (
              <div>
                {/* 搜索框 */}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索笔记…"
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-neutral-300 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none transition-all"
                  />
                </div>

                {/* 已删除笔记列表 */}
                <div className="mt-4">
                  {recycleList.length === 0 ? (
                    /* 空状态：回收站没有任何笔记 */
                    <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
                      回收站为空
                    </p>
                  ) : filteredList.length === 0 ? (
                    /* 空状态：搜索无结果 */
                    <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
                      未找到匹配的笔记
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {filteredList.map((note: NoteItem) => (
                        <li
                          key={note.id}
                          className="flex items-center rounded-xl transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          onMouseEnter={() => setHoverRowNoteId(note.id)}
                          onMouseLeave={() => setHoverRowNoteId(null)}
                        >
                          {/* 主点击区：点击进入原回收站视图并渲染该笔记 */}
                          <button
                            type="button"
                            onClick={() => handleOpenRecycleNote(note)}
                            className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2.5 text-left cursor-pointer font-normal"
                          >
                            <FileText
                              size={14}
                              className="mt-1 shrink-0 text-neutral-400 dark:text-neutral-500"
                            />
                            <span className="min-w-0">
                              <ScrollableTitle
                                text={note.title}
                                hovered={hoverRowNoteId === note.id}
                                className="text-[15px] text-neutral-700 dark:text-neutral-300"
                              />
                              <span className="block mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                                删除于 {formatDate(note.updated_at)}
                              </span>
                            </span>
                          </button>

                          {/* 恢复按钮：绿色圆角，阻止冒泡 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreOne(note);
                            }}
                            className="mr-2 shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-500 text-white hover:bg-green-400 cursor-pointer transition-colors"
                          >
                            <RotateCcw size={14} className="shrink-0" />
                            恢复
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 通用设置面板：外观三选一
 * 三个有边框圆角按钮，图标在上、文字在下；选中项以深色边框 + 底色高亮。
 */
function GeneralPanel({
  mode,
  setMode,
}: {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        外观
      </h3>
      <div className="mt-3 flex items-center gap-3">
        {THEME_OPTIONS.map(({ mode: optionMode, label, Icon }) => {
          const active: boolean = mode === optionMode;
          return (
            <button
              key={optionMode}
              type="button"
              onClick={() => setMode(optionMode)}
              className={`w-24 flex flex-col items-center gap-1.5 px-4 py-3 text-sm rounded-lg border cursor-pointer transition-colors ${
                active
                  ? "border-neutral-800 dark:border-neutral-200 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500"
              }`}
            >
              <Icon size={20} className="shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
