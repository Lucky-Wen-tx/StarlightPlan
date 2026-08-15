/**
 * 回收站全局状态管理（zustand）
 *
 * 维护回收站视图开关、回收站笔记列表、当前预览的回收站笔记、
 * 以及复选框勾选项集合，并提供进入/退出/列表/预览/勾选/恢复/彻底删除操作。
 *
 * 与笔记 store（useNoteStore）的联动：
 * - 进入回收站视图时清空当前笔记选中态，避免右侧继续渲染可编辑编辑器、
 *   顶部导出按钮误用上一篇笔记
 * - 恢复笔记后同步刷新笔记列表，保证退出回收站回到笔记视图时数据一致
 */
import { create } from "zustand";
import type { NoteItem, NoteDetail } from "@/types/note";
import * as api from "@/lib/api";
import { useNoteStore } from "@/store/useNoteStore";

// ── Store 类型定义 ────────────────────────────────────────────
interface RecycleStore {
  // ── 状态 ──────────────────────────────────────────────────
  /** 回收站视图是否打开（打开时侧栏展示回收站、右侧展示只读预览） */
  isOpen: boolean;
  /** 回收站笔记摘要列表（按删除时间倒序） */
  recycleList: NoteItem[];
  /** 当前预览的回收站笔记 ID，null 表示未预览 */
  currentRecycleId: string | null;
  /** 当前预览的回收站笔记正文 */
  currentRecycleContent: string;
  /** 复选框勾选中的笔记 ID 集合 */
  selectedIds: string[];

  // ── 视图切换 ─────────────────────────────────────────────
  /** 进入回收站视图：清空笔记选中态 + 拉取回收站列表 */
  enter: () => Promise<void>;
  /** 退出回收站视图：关闭开关并清空选择状态 */
  exit: () => void;

  // ── 数据操作 ─────────────────────────────────────────────
  /** 拉取回收站笔记列表 */
  fetchList: () => Promise<void>;
  /** 预览一篇回收站笔记：拉取详情 → 同步 currentRecycleId / currentRecycleContent */
  selectNote: (id: string) => Promise<void>;

  // ── 勾选操作 ─────────────────────────────────────────────
  /** 切换单篇笔记的勾选状态 */
  toggleSelect: (id: string) => void;
  /** 全选 / 取消全选（全部已选时点击变为取消全选） */
  selectAll: () => void;
  /** 清空所有勾选 */
  clearSelection: () => void;

  // ── 批量操作 ─────────────────────────────────────────────
  /** 恢复所有勾选的笔记到笔记列表，并刷新回收站与笔记两侧列表 */
  restoreSelected: () => Promise<void>;
  /** 彻底删除所有勾选的笔记（不可恢复），并刷新回收站列表 */
  permanentDeleteSelected: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// Store 实例
// ═══════════════════════════════════════════════════════════════
export const useRecycleStore = create<RecycleStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────────────────────────
  isOpen: false,
  recycleList: [],
  currentRecycleId: null,
  currentRecycleContent: "",
  selectedIds: [],

  // ── 视图切换 ──────────────────────────────────────────────
  enter: async (): Promise<void> => {
    // 1. 清空当前笔记选中态：避免右侧继续渲染可编辑编辑器、顶部导出误用上一篇笔记
    useNoteStore.getState().setCurrentId(null);
    useNoteStore.getState().setCurrentTitle("");
    useNoteStore.getState().setCurrentContent("");
    useNoteStore.getState().setLastSavedAt(null);
    // 2. 打开回收站视图，重置选择与预览状态
    set({
      isOpen: true,
      selectedIds: [],
      currentRecycleId: null,
      currentRecycleContent: "",
    });
    // 3. 拉取回收站列表（失败时抛出，由调用方以轻提示反馈）
    await get().fetchList();
  },

  exit: (): void => {
    set({
      isOpen: false,
      selectedIds: [],
      currentRecycleId: null,
      currentRecycleContent: "",
    });
  },

  // ── 数据操作 ──────────────────────────────────────────────
  fetchList: async (): Promise<void> => {
    const list: NoteItem[] = await api.getRecycleList();
    set({ recycleList: list });
  },

  selectNote: async (id: string): Promise<void> => {
    const detail: NoteDetail = await api.getRecycleDetail(id);
    set({
      currentRecycleId: id,
      currentRecycleContent: detail.content,
    });
  },

  // ── 勾选操作 ──────────────────────────────────────────────
  toggleSelect: (id: string): void => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    }));
  },

  selectAll: (): void => {
    const { recycleList, selectedIds } = get();
    // 全部已选（且列表非空）→ 取消全选；否则全选
    const allSelected: boolean =
      recycleList.length > 0 && selectedIds.length === recycleList.length;
    set({
      selectedIds: allSelected
        ? []
        : recycleList.map((note) => note.id),
    });
  },

  clearSelection: (): void => {
    set({ selectedIds: [] });
  },

  // ── 批量操作 ──────────────────────────────────────────────
  restoreSelected: async (): Promise<void> => {
    const ids: string[] = get().selectedIds;
    if (ids.length === 0) {
      return;
    }
    // 逐篇调用恢复接口（Promise.all 并发请求）
    await Promise.all(ids.map((id) => api.restoreRecycleNote(id)));

    // 若当前预览的笔记正是被恢复的其中一篇 → 清空预览
    const state = get();
    const previewCleared: boolean =
      state.currentRecycleId !== null && ids.includes(state.currentRecycleId);
    set({
      selectedIds: [],
      currentRecycleId: previewCleared ? null : state.currentRecycleId,
      currentRecycleContent: previewCleared ? "" : state.currentRecycleContent,
    });

    // 刷新回收站列表 + 笔记列表（恢复后笔记列表应包含新恢复的笔记）
    await get().fetchList();
    await useNoteStore.getState().fetchNoteList();
  },

  permanentDeleteSelected: async (): Promise<void> => {
    const ids: string[] = get().selectedIds;
    if (ids.length === 0) {
      return;
    }
    // 逐篇调用彻底删除接口
    await Promise.all(ids.map((id) => api.permanentDeleteRecycle(id)));

    // 若当前预览的笔记正是被彻底删除的其中一篇 → 清空预览
    const state = get();
    const previewCleared: boolean =
      state.currentRecycleId !== null && ids.includes(state.currentRecycleId);
    set({
      selectedIds: [],
      currentRecycleId: previewCleared ? null : state.currentRecycleId,
      currentRecycleContent: previewCleared ? "" : state.currentRecycleContent,
    });

    // 刷新回收站列表（彻底删除不影响笔记列表）
    await get().fetchList();
  },
}));
