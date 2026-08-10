"use client";

/**
 * 左侧边栏
 * - 顶部：新建笔记按钮（弹出输入弹窗填标题 → api.create → 刷新列表并选中）
 * - 下方：笔记列表（从 store 读取，点击切换当前笔记，高亮选中项；三点菜单支持重命名/删除，均走自定义模态框）
 */
import { useEffect, useCallback, useState, useMemo, useRef, useLayoutEffect } from "react";
import { PenLine, FileText, Search, Ellipsis, Trash2 } from "lucide-react";
import { useNoteStore } from "@/store/useNoteStore";
import { useToastStore } from "@/store/useToastStore";
import * as api from "@/lib/api";
import type { NoteItem } from "@/types/note";
import InputDialog from "@/components/common/InputDialog";
import ConfirmDialog from "@/components/common/ConfirmDialog";

/**
 * 笔记操作悬浮菜单卡片
 *
 * 定位策略：
 * - 使用 position: fixed + 锚点按钮的 getBoundingClientRect() 计算坐标，
 *   规避父级 nav 的 overflow-y-auto 滚动容器裁剪
 * - 默认位于三点按钮右下方（卡片左边缘与按钮左边缘对齐，向下向右展开）
 * - 越界自适应：下方放不下时向上翻转；左右越界时夹紧贴边，保证不被截断
 *
 * 关闭方式：点击页面空白处 / 按 ESC / 页面滚动 / 再次点击三点按钮（由父组件处理）
 */
function NoteContextMenu({
  anchorRef,
  note,
  onClose,
  onRename,
  onDelete,
}: {
  /** 三点按钮的引用（读取锚点坐标 + 判断点击是否落在按钮上） */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  /** 当前笔记（菜单针对该笔记操作） */
  note: NoteItem;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 点击「重命名」后的回调（父组件内部已含关闭卡片逻辑） */
  onRename: (note: NoteItem) => void;
  /** 点击「删除」后的回调（父组件内部已含关闭卡片逻辑） */
  onDelete: (note: NoteItem) => void;
}): React.ReactElement {
  /** 卡片自身 DOM 引用：测量尺寸 + 判断点击是否落在卡片内 */
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ── 卡片尺寸与间距常量（需与下方样式保持一致）──────────────
  /** 卡片固定宽度 */
  const CARD_WIDTH = 150;
  /** 卡片与三点按钮的垂直间距 */
  const CARD_GAP = 6;
  /** 卡片贴视口边缘的安全距离 */
  const EDGE_PADDING = 8;

  // ── 挂载后测量并定位（useLayoutEffect 在浏览器绘制前执行，无闪动）──
  // 直接写 style 定位，不触发 setState，避免额外的级联渲染
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) {
      return;
    }

    const anchorRect: DOMRect = anchor.getBoundingClientRect();
    const menuHeight: number = menu.offsetHeight;

    // 默认位置：卡片上边贴按钮下边（向下弹出），左边缘与按钮左边缘对齐，向右下方展开
    let top: number = anchorRect.bottom + CARD_GAP;
    let left: number = anchorRect.left;

    // 水平越界：夹紧到视口内（左右均不超出）
    left = Math.max(
      EDGE_PADDING,
      Math.min(left, window.innerWidth - CARD_WIDTH - EDGE_PADDING),
    );
    // 垂直越界：下方放不下时，翻转到按钮上方弹出
    if (top + menuHeight > window.innerHeight - EDGE_PADDING) {
      top = Math.max(EDGE_PADDING, anchorRect.top - CARD_GAP - menuHeight);
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = "visible";
  }, [anchorRef]);

  // ── 点击外部 / 按 ESC / 页面滚动 关闭 ──────────────────────
  useEffect(() => {
    // 点击页面空白处：目标既不在卡片内、也不在锚点按钮内时关闭。
    // 锚点按钮内的点击不在此关闭，交由父组件 handleToggleMenu 处理开合
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    // 按 ESC 关闭
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    // 滚动即关闭：scroll 事件不冒泡，用 capture 捕获任意滚动容器（侧栏/编辑器）
    const handleScroll = (): void => {
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    return (): void => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${note.title} 的操作菜单`}
      // 初始隐藏，useLayoutEffect 测量定位完成后再置为可见，避免闪现错误位置
      style={{
        position: "fixed",
        width: CARD_WIDTH,
        top: 0,
        left: 0,
        visibility: "hidden",
        zIndex: 50,
      }}
      // 白底 / 8px 圆角 / 无边框 / 多层柔和悬浮阴影
      className="rounded-lg bg-white dark:bg-neutral-800 p-1 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_8px_rgba(0,0,0,0.04),0_10px_20px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.25),0_12px_24px_-6px_rgba(0,0,0,0.4)]"
    >
      {/* 重命名：图标在左、文字在右；hover 圆角浅灰高亮（无尖角） */}
      <button
        type="button"
        role="menuitem"
        onClick={() => onRename(note)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
      >
        <PenLine size={15} className="shrink-0" />
        重命名
      </button>

      {/* 删除笔记：图标在左、文字在右；hover 圆角浅灰高亮（无尖角）；删除项文字红色 */}
      <button
        type="button"
        role="menuitem"
        onClick={() => onDelete(note)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors text-red-500 rounded-md hover:bg-neutral-100 dark:text-red-400 dark:hover:bg-neutral-700/60"
      >
        <Trash2 size={15} className="shrink-0" />
        删除笔记
      </button>
    </div>
  );
}

export default function Sidebar(): React.ReactElement {
  // ── 从 store 读取状态 ──────────────────────────────────────
  const noteList: NoteItem[] = useNoteStore((s) => s.noteList);
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const fetchNoteList = useNoteStore((s) => s.fetchNoteList);
  const selectNote = useNoteStore((s) => s.selectNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const renameNote = useNoteStore((s) => s.renameNote);
  const showToast = useToastStore((s) => s.showToast);

  // ── 搜索状态 ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ── 前端实时过滤：按标题模糊匹配 ──────────────────────────
  const filteredList = useMemo<NoteItem[]>(() => {
    if (!searchQuery.trim()) {
      return noteList;
    }
    const keyword = searchQuery.trim().toLowerCase();
    return noteList.filter((note) =>
      note.title.toLowerCase().includes(keyword),
    );
  }, [noteList, searchQuery]);

  // ── 笔记操作菜单状态 ────────────────────────────────────────
  /** 当前展开操作菜单的笔记 ID，null 表示无菜单打开 */
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  /** 三点按钮 DOM 引用：菜单 fixed 定位时读取锚点屏幕坐标 */
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // ── 模态框状态（替代原生 prompt / confirm）────────────────────
  /** 新建 / 重命名共用的输入弹窗状态：null 表示关闭 */
  const [inputDialog, setInputDialog] = useState<
    | { mode: "create" }
    | { mode: "rename"; note: NoteItem }
    | null
  >(null);
  /** 待删除确认的笔记：null 表示无删除弹窗打开 */
  const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);

  // 组件挂载时拉取笔记列表
  useEffect(() => {
    fetchNoteList();
  }, [fetchNoteList]);

  // ── 三点按钮：点击切换菜单开合 ──────────────────────────────
  const handleToggleMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, noteId: string): void => {
      // 阻止冒泡，避免误触外层"切换笔记"逻辑
      e.stopPropagation();
      // 记录当前锚点按钮（菜单 fixed 定位需要其屏幕坐标）
      moreButtonRef.current = e.currentTarget;
      setMenuNoteId((prev) => (prev === noteId ? null : noteId));
    },
    [],
  );

  // ── 关闭操作菜单 ────────────────────────────────────────────
  const handleCloseMenu = useCallback((): void => {
    setMenuNoteId(null);
  }, []);

  // ── 删除笔记：打开确认弹窗（确认后才执行软删除）──────────
  const handleDeleteNote = useCallback((note: NoteItem): void => {
    // 点击菜单项即关闭卡片（无论弹窗结果如何，均不保持打开）
    setMenuNoteId(null);
    // 记录待删除笔记 → 弹出删除确认模态框
    setDeleteTarget(note);
  }, []);

  // ── 删除确认：调用软删除，出错时以轻提示反馈 ─────────────
  const handleDeleteConfirm = useCallback(
    async (note: NoteItem): Promise<void> => {
      setDeleteTarget(null);
      try {
        await deleteNote(note.id);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "删除笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [deleteNote, showToast],
  );

  // ── 重命名笔记：打开输入弹窗，预填原标题，便于直接修改 ──
  const handleRenameNote = useCallback((note: NoteItem): void => {
    // 点击菜单项即关闭卡片（与删除行为保持一致）
    setMenuNoteId(null);
    // 打开输入弹窗（title=重命名笔记，预填当前标题）
    setInputDialog({ mode: "rename", note });
  }, []);

  // ── 重命名确认：提交新标题，出错时以轻提示反馈 ───────────
  const handleRenameConfirm = useCallback(
    async (note: NoteItem, newTitle: string): Promise<void> => {
      setInputDialog(null);
      try {
        await renameNote(note.id, newTitle);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "重命名笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [renameNote, showToast],
  );

  // ── 新建笔记：打开输入弹窗（输入标题后确认创建）──────────
  const handleCreate = useCallback((): void => {
    setInputDialog({ mode: "create" });
  }, []);

  // ── 新建确认：调用后端创建 → 刷新列表并自动选中新笔记 ───
  const handleCreateConfirm = useCallback(
    async (title: string): Promise<void> => {
      setInputDialog(null);
      try {
        const detail = await api.create(title);
        // 刷新列表并自动选中新建的笔记
        await fetchNoteList();
        await selectNote(detail.id);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "新建笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [fetchNoteList, selectNote, showToast],
  );

  // ── 切换笔记 ──────────────────────────────────────────────
  const handleSelect = useCallback(
    async (id: string): Promise<void> => {
      // 切换笔记时顺带关闭操作菜单，避免悬浮卡片残留
      setMenuNoteId(null);
      // 避免重复选中同一篇
      if (id === currentId) {
        return;
      }
      try {
        await selectNote(id);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "加载笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [currentId, selectNote, showToast],
  );

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      {/* ── 新建笔记按钮区 ─────────────────────────────────── */}
      <div className="p-4 pb-2">
        <button
          type="button"
          onClick={handleCreate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-base font-medium rounded-xl cursor-pointer border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.03)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.04),0_2px_4px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.2)] active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_2px_rgba(0,0,0,0.06)] dark:active:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.15)] transition-all duration-200 ease-out"
        >
          <PenLine size={16} />
          新建笔记
        </button>
      </div>

      {/* ── 搜索框 ─────────────────────────────────────────── */}
      <div className="px-4 pb-3">
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
      </div>

      {/* ── 分割线 ─────────────────────────────────────────── */}
      <div className="mx-4 border-t border-neutral-100 dark:border-neutral-800" />

      {/* ── 笔记列表 ───────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-4 py-3">
        {noteList.length === 0 ? (
          /* 空状态：没有任何笔记 */
          <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
            暂无笔记，点击上方按钮创建
          </p>
        ) : filteredList.length === 0 ? (
          /* 空状态：搜索无结果 */
          <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
            未找到匹配的笔记
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredList.map((note: NoteItem) => {
              const isActive: boolean = note.id === currentId;
              const isMenuOpen: boolean = menuNoteId === note.id;
              return (
                <li key={note.id} className="group relative">
                  {/* 条目容器：整行 hover 时显示右侧三点按钮；高亮/选中样式与原先一致 */}
                  <div
                    className={`flex items-center rounded-xl transition-all ${
                      isActive
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {/* 主点击区：点击选择/切换笔记 */}
                    <button
                      type="button"
                      onClick={() => handleSelect(note.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2.5 text-left cursor-pointer font-normal"
                    >
                      <FileText
                        size={14}
                        className={`shrink-0 ${
                          isActive
                            ? "text-neutral-700 dark:text-neutral-300"
                            : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      />
                      <span
                        className={`text-[15px] truncate ${
                          isActive
                            ? "text-neutral-800 dark:text-neutral-200 font-bold"
                            : "text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {note.title}
                      </span>
                    </button>

                    {/* 三点操作按钮：默认隐藏，hover 整行显示；菜单展开期间常显 */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleMenu(e, note.id)}
                      title="笔记操作"
                      aria-label={`${note.title} 的操作菜单`}
                      aria-expanded={isMenuOpen}
                      className={`mr-1.5 shrink-0 p-1 rounded-md text-neutral-400 dark:text-neutral-500 cursor-pointer transition-all duration-150 ${
                        isMenuOpen
                          ? "opacity-100 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                          : "opacity-0 group-hover:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300"
                      }`}
                    >
                      <Ellipsis size={15} />
                    </button>
                  </div>

                  {/* 悬浮操作菜单卡片（仅当前行打开时渲染） */}
                  {isMenuOpen && (
                    <NoteContextMenu
                      anchorRef={moreButtonRef}
                      note={note}
                      onClose={handleCloseMenu}
                      onRename={handleRenameNote}
                      onDelete={handleDeleteNote}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* ── 新建 / 重命名输入弹窗（共用组件，仅标题与预填值不同）── */}
      {inputDialog && (
        <InputDialog
          open
          title={inputDialog.mode === "create" ? "新建笔记" : "重命名笔记"}
          initialValue={
            inputDialog.mode === "rename" ? inputDialog.note.title : ""
          }
          onClose={() => setInputDialog(null)}
          onConfirm={(value) =>
            inputDialog.mode === "create"
              ? handleCreateConfirm(value)
              : handleRenameConfirm(inputDialog.note, value)
          }
        />
      )}

      {/* ── 删除确认弹窗 ── */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="删除笔记"
          message="确定要删除该笔记吗？删除后将置入回收站。"
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteConfirm(deleteTarget)}
        />
      )}
    </aside>
  );
}
