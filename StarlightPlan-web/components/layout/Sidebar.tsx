"use client";

/**
 * 左侧边栏
 * - 顶部：新建笔记按钮（弹出输入弹窗填标题 → api.create → 刷新列表并选中）
 * - 下方：笔记列表（从 store 读取，点击切换当前笔记，高亮选中项；三点菜单支持重命名/删除，均走自定义模态框）
 */
import { useEffect, useCallback, useState, useMemo, useRef, useLayoutEffect } from "react";
import {
  PenLine,
  FileText,
  Search,
  Ellipsis,
  Trash2,
  Pin,
  PinOff,
} from "lucide-react";
import { useNoteStore } from "@/store/useNoteStore";
import { useRecycleStore } from "@/store/useRecycleStore";
import { useToastStore } from "@/store/useToastStore";
import * as api from "@/lib/api";
import type { NoteItem } from "@/types/note";
import InputDialog from "@/components/common/InputDialog";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ScrollableTitle from "@/components/common/ScrollableTitle";
import RecycleBin from "@/components/layout/RecycleBin";

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
  onTogglePin,
  onRename,
  onDelete,
}: {
  /** 三点按钮的引用（读取锚点坐标 + 判断点击是否落在按钮上） */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  /** 当前笔记（菜单针对该笔记操作） */
  note: NoteItem;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 点击「置顶/取消置顶」后的回调（父组件内部已含关闭卡片逻辑） */
  onTogglePin: (note: NoteItem) => void;
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
      {/* 置顶 / 取消置顶：图标在左、文字在右；hover 圆角浅灰高亮（无尖角） */}
      <button
        type="button"
        role="menuitem"
        onClick={() => onTogglePin(note)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors text-neutral-700 dark:text-neutral-200 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
      >
        {note.is_pinned ? (
          <PinOff size={15} className="shrink-0" />
        ) : (
          <Pin size={15} className="shrink-0" />
        )}
        {note.is_pinned ? "取消置顶" : "置顶"}
      </button>

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
  const togglePin = useNoteStore((s) => s.togglePin);
  /** 最近编辑分区的 7 天窗口截止时间戳（由 store 在拉取列表时刷新） */
  const recentCutoffMs = useNoteStore((s) => s.recentCutoffMs);
  const showToast = useToastStore((s) => s.showToast);

  // ── 回收站视图状态 ────────────────────────────────────────
  const isRecycleOpen: boolean = useRecycleStore((s) => s.isOpen);
  const enterRecycle = useRecycleStore((s) => s.enter);

  // ── 搜索状态 ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState<string>("");

  /** 是否处于搜索状态（有非空关键词） */
  const isSearching = searchQuery.trim().length > 0;

  // ── 前端实时过滤：按标题模糊匹配 ──────────────────────────
  const filteredList = useMemo<NoteItem[]>(() => {
    if (!isSearching) {
      return noteList;
    }
    const keyword = searchQuery.trim().toLowerCase();
    return noteList.filter((note) =>
      note.title.toLowerCase().includes(keyword),
    );
  }, [noteList, searchQuery, isSearching]);

  // ── 三区分组：置顶 / 最近编辑（7 天内非置顶前 6 篇）/ 其它 ──
  const { pinned, recent, rest } = useMemo(() => {
    // 显式按修改时间倒序排序（防御自动保存后本地列表短暂乱序）
    const sorted: NoteItem[] = [...noteList].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
    const pinned: NoteItem[] = [];
    const unpinned: NoteItem[] = [];
    for (const note of sorted) {
      (note.is_pinned ? pinned : unpinned).push(note);
    }
    // 最近编辑：仅统计 7 天内有修改的笔记，最多取前 6 篇
    const recent: NoteItem[] = [];
    for (const note of unpinned) {
      // 列表已按时间倒序，遇到早于 7 天的即终止
      if (Date.parse(note.updated_at) < recentCutoffMs) {
        break;
      }
      recent.push(note);
      if (recent.length >= 6) {
        break;
      }
    }
    return { pinned, recent, rest: unpinned.slice(recent.length) };
  }, [noteList, recentCutoffMs]);

  // 分区标题仅在列表真正拆成多个分区时展示，避免单一分区/小列表出现多余的标题
  const showPinned = pinned.length > 0;
  const showRecent = recent.length > 0;
  const showRest = rest.length > 0;
  const sectionCount =
    Number(showPinned) + Number(showRecent) + Number(showRest);
  const showHeaders = sectionCount > 1;

  // ── 笔记操作菜单状态 ────────────────────────────────────────
  /** 当前展开操作菜单的笔记 ID，null 表示无菜单打开 */
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  /**
   * 当前鼠标悬停在三点按钮上的笔记 ID，null 表示未悬停。
   * 用于置顶笔记的图标切换：行 hover 显示 Pin，悬停到按钮上才显示三点菜单图标。
   */
  const [hoverBtnNoteId, setHoverBtnNoteId] = useState<string | null>(null);
  /**
   * 当前鼠标悬停的笔记条目 ID，null 表示未悬停。
   * 驱动标题走马灯：悬浮在整个条目（行）上即触发动画，与行的悬浮背景区域一致。
   */
  const [hoverRowNoteId, setHoverRowNoteId] = useState<string | null>(null);
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
        // 删除成功（软删除 → 移入回收站）以成功轻提示反馈
        showToast("已移入回收站", "success");
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
        // 重命名成功以成功轻提示反馈
        showToast("重命名成功", "success");
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "重命名笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [renameNote, showToast],
  );

  // ── 置顶 / 取消置顶：切换成功无需提示，失败以轻提示反馈 ──
  const handleTogglePin = useCallback(
    async (note: NoteItem): Promise<void> => {
      // 点击菜单项即关闭卡片（与重命名/删除行为保持一致）
      setMenuNoteId(null);
      try {
        await togglePin(note.id);
        // 需求：置顶切换成功无需 toast
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "置顶操作失败，请稍后重试";
        showToast(message);
      }
    },
    [togglePin, showToast],
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
        // 新建成功以成功轻提示反馈
        showToast("新建笔记成功", "success");
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

  // ── 打开回收站视图（返回由回收站顶部按钮负责）─────────────
  const handleOpenRecycle = useCallback((): void => {
    // 拉取回收站列表失败时以轻提示反馈
    enterRecycle().catch((err: unknown) => {
      const message: string =
        err instanceof Error ? err.message : "进入回收站失败，请稍后重试";
      showToast(message);
    });
  }, [enterRecycle, showToast]);

  // ── 渲染单条笔记列表项（搜索扁平列表与三个分区复用）───────
  const renderNote = (note: NoteItem): React.ReactElement => {
    const isActive: boolean = note.id === currentId;
    const isMenuOpen: boolean = menuNoteId === note.id;
    /** 鼠标是否悬停在三点按钮上（置顶笔记用于 Pin/三点图标切换） */
    const isBtnHovered: boolean = hoverBtnNoteId === note.id;
    /** 是否显示 Pin 图标：置顶笔记、菜单未展开、且未悬停在按钮上 */
    const showPinIcon: boolean = note.is_pinned && !isMenuOpen && !isBtnHovered;
    return (
      <li key={note.id} className="group relative">
        {/* 条目容器：整行 hover 时显示右侧三点按钮并触发标题走马灯；高亮/选中样式与原先一致 */}
        <div
          className={`flex items-center rounded-xl transition-all ${
            isActive
              ? "bg-neutral-100 dark:bg-neutral-800"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
          onMouseEnter={() => setHoverRowNoteId(note.id)}
          onMouseLeave={() => setHoverRowNoteId(null)}
        >
          {/* 主点击区：点击选择/切换笔记 */}
          <button
            type="button"
            onClick={() => handleSelect(note.id)}
            className="flex-1 min-w-0 flex items-center gap-2 pl-4 pr-1 py-2.5 text-left cursor-pointer font-normal"
          >
            <FileText
              size={14}
              className={`shrink-0 ${
                isActive
                  ? "text-neutral-700 dark:text-neutral-300"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}
            />
            <ScrollableTitle
              text={note.title}
              hovered={hoverRowNoteId === note.id}
              className={`flex-1 min-w-0 text-[15px] ${
                isActive
                  ? "text-neutral-800 dark:text-neutral-200 font-bold"
                  : "text-neutral-700 dark:text-neutral-300"
              }`}
            />
          </button>

          {/* 三点操作按钮：默认隐藏，hover 整行显示；菜单展开期间常显。
              置顶笔记：行 hover 时先显示 Pin 图标，鼠标滑到按钮位置时再切换为三点菜单图标。
              同一时间只渲染一个图标（用 hoverBtnNoteId 状态控制），避免图标重叠 */}
          <button
            type="button"
            onClick={(e) => handleToggleMenu(e, note.id)}
            onMouseEnter={() => setHoverBtnNoteId(note.id)}
            onMouseLeave={() => setHoverBtnNoteId(null)}
            aria-label={`${note.title} 的操作菜单`}
            aria-expanded={isMenuOpen}
            className={`mr-1.5 shrink-0 p-1 rounded-md text-neutral-400 dark:text-neutral-500 cursor-pointer transition-all duration-150 ${
              isMenuOpen
                ? "opacity-100 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                : "opacity-0 group-hover:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-600 dark:hover:text-neutral-300"
            }`}
          >
            {showPinIcon ? (
              <Pin size={15} />
            ) : (
              <Ellipsis size={15} />
            )}
          </button>
        </div>

        {/* 悬浮操作菜单卡片（仅当前行打开时渲染） */}
        {isMenuOpen && (
          <NoteContextMenu
            anchorRef={moreButtonRef}
            note={note}
            onClose={handleCloseMenu}
            onTogglePin={handleTogglePin}
            onRename={handleRenameNote}
            onDelete={handleDeleteNote}
          />
        )}
      </li>
    );
  };

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      {/* ── 回收站视图：整体替换为回收站面板 ───────────────── */}
      {isRecycleOpen ? (
        <RecycleBin />
      ) : (
        <>
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
        ) : isSearching && filteredList.length === 0 ? (
          /* 空状态：搜索无结果 */
          <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
            未找到匹配的笔记
          </p>
        ) : isSearching ? (
          /* 搜索态：扁平匹配列表，不做分区；置顶笔记保留 Pin 小图标提示 */
          <ul className="space-y-1">{filteredList.map(renderNote)}</ul>
        ) : (
          /* 常态：按 置顶 / 最近编辑 / 其它 分区展示；
             仅当拆成多个分区时才显示分区标题，单一分区保持扁平列表 */
          <div className="space-y-1">
            {showPinned && (
              <section className={showHeaders ? "pt-2" : ""}>
                {showHeaders && (
                  <h3 className="px-3 pb-1 flex items-center gap-1 text-xs font-medium text-neutral-400 dark:text-neutral-500">
                    <Pin size={12} className="shrink-0" />
                    置顶
                  </h3>
                )}
                <ul className="space-y-1">{pinned.map(renderNote)}</ul>
              </section>
            )}
            {showRecent && (
              <section className={showHeaders ? "pt-2" : ""}>
                {showHeaders && (
                  <h3 className="px-3 pb-1 text-xs font-medium text-neutral-400 dark:text-neutral-500">
                    最近编辑
                  </h3>
                )}
                <ul className="space-y-1">{recent.map(renderNote)}</ul>
              </section>
            )}
            {showRest && (
              <section className={showHeaders ? "pt-2" : ""}>
                {showHeaders && (
                  <h3 className="px-3 pb-1 text-xs font-medium text-neutral-400 dark:text-neutral-500">
                    其它
                  </h3>
                )}
                <ul className="space-y-1">{rest.map(renderNote)}</ul>
              </section>
            )}
          </div>
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
        </>
      )}

      {/* ── 底部：回收站入口（仅笔记视图显示，返回由回收站顶部按钮负责） ── */}
      {!isRecycleOpen && (
        <button
          type="button"
          onClick={handleOpenRecycle}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 cursor-pointer transition-colors text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          <Trash2 size={15} className="shrink-0" />
          回收站
        </button>
      )}
    </aside>
  );
}
