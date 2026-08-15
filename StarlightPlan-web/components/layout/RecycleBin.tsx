"use client";

/**
 * 回收站侧栏面板
 *
 * 布局（自上而下）：
 * - 顶部：垃圾桶图标 + 「回收站」标题，下方「共 N 篇，已选 M 篇」计数
 * - 中部：可滚动回收站列表，每项 = 复选框 +（标题 / 删除于时间 上下排列），
 *   点击条目在右侧只读预览
 * - 底部：恢复 / 全选（全选与取消全选切换）/ 彻底删除（危险操作，弹确认框）
 *
 * 交互说明：
 * - 复选框点击不触发展开预览（独立勾选逻辑）
 * - 彻底删除不可恢复，必须经 ConfirmDialog 二次确认
 * - 恢复/彻底删除按钮在无勾选时禁用
 */
import { useCallback, useState } from "react";
import {
  Trash2,
  RotateCcw,
  CheckSquare,
  Square,
  FileText,
  ChevronLeft,
} from "lucide-react";
import { useRecycleStore } from "@/store/useRecycleStore";
import { useToastStore } from "@/store/useToastStore";
import type { NoteItem } from "@/types/note";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ScrollableTitle from "@/components/common/ScrollableTitle";

/**
 * 将 ISO 时间字符串格式化为 YYYY/MM/DD
 * @param iso - 后端返回的 ISO 8601 时间字符串
 * @returns 形如 2026/08/10；解析失败时返回「未知时间」兜底
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  const year: number = date.getFullYear();
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const day: string = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export default function RecycleBin(): React.ReactElement {
  // ── 从 store 读取回收站状态与操作 ───────────────────────────
  const recycleList: NoteItem[] = useRecycleStore((s) => s.recycleList);
  const selectedIds: string[] = useRecycleStore((s) => s.selectedIds);
  const currentRecycleId: string | null = useRecycleStore(
    (s) => s.currentRecycleId,
  );
  const selectNote = useRecycleStore((s) => s.selectNote);
  const toggleSelect = useRecycleStore((s) => s.toggleSelect);
  const selectAll = useRecycleStore((s) => s.selectAll);
  const restoreSelected = useRecycleStore((s) => s.restoreSelected);
  const permanentDeleteSelected = useRecycleStore(
    (s) => s.permanentDeleteSelected,
  );
  const exitRecycle = useRecycleStore((s) => s.exit);
  const showToast = useToastStore((s) => s.showToast);

  /** 彻底删除确认弹窗开关 */
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  /**
   * 当前鼠标悬停的条目 ID，null 表示未悬停。
   * 驱动标题走马灯：悬浮在整个条目（行）上即触发动画，与行的悬浮背景区域一致。
   */
  const [hoverRowNoteId, setHoverRowNoteId] = useState<string | null>(null);

  // ── 派生状态 ──────────────────────────────────────────────
  /** 是否所有条目均被勾选（用于「全选/取消全选」文案切换） */
  const allSelected: boolean =
    recycleList.length > 0 && selectedIds.length === recycleList.length;
  /** 是否有勾选项（决定恢复/彻底删除按钮是否可用） */
  const hasSelection: boolean = selectedIds.length > 0;

  // ── 点击条目：右侧只读预览 ────────────────────────────────
  const handleSelect = useCallback(
    async (note: NoteItem): Promise<void> => {
      // 已选中预览的笔记再次点击不重复请求
      if (note.id === currentRecycleId) {
        return;
      }
      try {
        await selectNote(note.id);
      } catch (err: unknown) {
        const message: string =
          err instanceof Error ? err.message : "加载笔记失败，请稍后重试";
        showToast(message);
      }
    },
    [currentRecycleId, selectNote, showToast],
  );

  // ── 恢复勾选的笔记 ────────────────────────────────────────
  const handleRestore = useCallback(async (): Promise<void> => {
    try {
      await restoreSelected();
      showToast("已恢复到笔记列表", "success");
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : "恢复笔记失败，请稍后重试";
      showToast(message);
    }
  }, [restoreSelected, showToast]);

  // ── 确认彻底删除 ──────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async (): Promise<void> => {
    setConfirmOpen(false);
    try {
      await permanentDeleteSelected();
      showToast("已彻底删除", "success");
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : "彻底删除失败，请稍后重试";
      showToast(message);
    }
  }, [permanentDeleteSelected, showToast]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── 顶部：返回按钮 + 图标 + 标题 + 计数 ─────────────── */}
      <div className="px-4 pt-3 pb-3 select-none">
        <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
          {/* 返回按钮：回到笔记列表视图 */}
          <button
            type="button"
            onClick={exitRecycle}
            aria-label="返回笔记列表"
            className="shrink-0 p-1 -ml-1 rounded-md cursor-pointer text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <Trash2 size={16} className="shrink-0" />
          <span className="text-base font-semibold">回收站</span>
        </div>
        {/* 计数文字 + 全选按钮同一行 */}
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            共 {recycleList.length} 篇，已选 {selectedIds.length} 篇
          </p>
          {/* 全选 / 取消全选（点击在两种状态间切换） */}
          <button
            type="button"
            onClick={selectAll}
            className="flex items-center gap-1.5 text-sm rounded-md leading-none cursor-pointer px-2 py-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            {allSelected ? (
              <CheckSquare size={16} className="shrink-0" />
            ) : (
              <Square size={16} className="shrink-0" />
            )}
            {allSelected ? "取消全选" : "全选"}
          </button>
        </div>
      </div>

      {/* 分割线 */}
      <div className="mx-4 border-t border-neutral-100 dark:border-neutral-800" />

      {/* ── 中部：回收站列表 ─────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-4 py-3">
        {recycleList.length === 0 ? (
          /* 空状态：回收站没有任何笔记 */
          <p className="py-8 text-center text-base text-neutral-400 dark:text-neutral-500">
            回收站为空
          </p>
        ) : (
          <ul className="space-y-1">
            {recycleList.map((note: NoteItem) => {
              const isActive: boolean = note.id === currentRecycleId;
              const isSelected: boolean = selectedIds.includes(note.id);
              return (
                <li
                  key={note.id}
                  className={`rounded-xl transition-all ${
                    isActive
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                  onMouseEnter={() => setHoverRowNoteId(note.id)}
                  onMouseLeave={() => setHoverRowNoteId(null)}
                >
                  <div className="flex items-center">
                    {/* 复选框：独立勾选，点击不触发展开预览 */}
                    <label
                      className="shrink-0 pl-3 pr-1 py-2 flex items-center cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(note.id);
                        }}
                        aria-label={`勾选笔记 ${note.title}`}
                        className="size-4 cursor-pointer accent-neutral-600 dark:accent-neutral-300"
                      />
                    </label>

                    {/* 主点击区：点击在右侧只读预览 */}
                    <button
                      type="button"
                      onClick={() => handleSelect(note)}
                      className="flex-1 min-w-0 flex items-start gap-2 px-1 py-2.5 pr-3 text-left cursor-pointer font-normal"
                    >
                      <FileText
                        size={14}
                        className={`mt-1 shrink-0 ${
                          isActive
                            ? "text-neutral-700 dark:text-neutral-300"
                            : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      />
                      {/* 标题在上、删除于时间在下，上下排列 */}
                      <span className="min-w-0">
                        <ScrollableTitle
                          text={note.title}
                          hovered={hoverRowNoteId === note.id}
                          className={`text-[15px] ${
                            isActive
                              ? "text-neutral-800 dark:text-neutral-200 font-bold"
                              : "text-neutral-700 dark:text-neutral-300"
                          }`}
                        />
                        <span className="block mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                          删除于 {formatDate(note.updated_at)}
                        </span>
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* ── 底部：恢复 / 彻底删除 ───────────────────────────── */}
      <div className="shrink-0 border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-1">
          {/* 恢复：选中后移回笔记列表 */}
          <button
            type="button"
            onClick={handleRestore}
            disabled={!hasSelection}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors border ${
              hasSelection
                ? "border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                : "border-neutral-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
            }`}
          >
            <RotateCcw size={16} className="shrink-0" />
            恢复
          </button>

          {/* 彻底删除：危险操作，需二次确认 */}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!hasSelection}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
              hasSelection
                ? "text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                : "text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
            }`}
          >
            <Trash2 size={16} className="shrink-0" />
            彻底删除
          </button>
        </div>
      </div>

      {/* ── 彻底删除确认弹窗（不可恢复提示） ────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="彻底删除"
        message={
          <>
            确定要彻底删除选中的{" "}
            <span className="font-semibold text-red-500">
              {selectedIds.length}
            </span>{" "}
            篇笔记吗？删除后不可恢复。
          </>
        }
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
