/**
 * 笔记全局状态管理（zustand）
 * 维护笔记列表、当前选中笔记的标题和正文，
 * 并提供基础 set 方法与异步拉取/选择操作。
 */
import { create } from "zustand";
import type { NoteItem } from "@/types/note";
import * as api from "@/lib/api";

// ── Store 类型定义 ────────────────────────────────────────────
interface NoteStore {
  // ── 状态 ──────────────────────────────────────────────────
  /** 笔记摘要列表（按修改时间倒序） */
  noteList: NoteItem[];
  /** 当前选中笔记的 ID，null 表示未选中任何笔记 */
  currentId: string | null;
  /** 当前笔记标题（编辑中实时更新） */
  currentTitle: string;
  /** 当前笔记正文（编辑中实时更新） */
  currentContent: string;
  /** 最近一次自动保存成功的时间（ISO 8601 字符串） */
  lastSavedAt: string | null;

  // ── 基础 set 方法 ─────────────────────────────────────────
  /** 批量替换笔记列表 */
  setNoteList: (list: NoteItem[]) => void;
  /** 设置当前选中笔记 ID */
  setCurrentId: (id: string | null) => void;
  /** 设置当前笔记标题 */
  setCurrentTitle: (title: string) => void;
  /** 设置当前笔记正文 */
  setCurrentContent: (content: string) => void;
  /** 设置最近保存时间 */
  setLastSavedAt: (time: string | null) => void;

  // ── 异步操作 ──────────────────────────────────────────────
  /** 从后端拉取笔记列表并更新 noteList */
  fetchNoteList: () => Promise<void>;
  /** 选中一篇笔记：拉取详情 → 同步 currentId / currentTitle / currentContent */
  selectNote: (id: string) => Promise<void>;
  /**
   * 删除一篇笔记（软删除，移入回收站）：
   * 1. 调用后端删除接口
   * 2. 刷新笔记列表
   * 3. 若删除的是当前打开的笔记，清空选中态（界面自动回到欢迎页）
   */
  deleteNote: (id: string) => Promise<void>;
  /**
   * 重命名一篇笔记（标题变更会同步重命名文件 → 返回的新 id 可能不同）：
   * 1. 调用后端更新标题（重命名当前笔记时连同最新正文一起保存，避免丢内容）
   * 2. 刷新笔记列表
   * 3. 若重命名的是当前打开的笔记，同步 currentId / currentTitle 到新 id 与新标题
   */
  renameNote: (oldId: string, newTitle: string) => Promise<void>;
  /**
   * 置顶 / 取消置顶一篇笔记：
   * 1. 乐观更新：立即翻转本地 is_pinned，界面无延迟反馈
   * 2. 调用后端置顶/取消接口
   * 3. 失败时刷新列表回滚为服务器真实状态，并抛出错误让调用方提示
   */
  togglePin: (id: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// Store 实例
// ═══════════════════════════════════════════════════════════════
export const useNoteStore = create<NoteStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────────────────────────
  noteList: [],
  currentId: null,
  currentTitle: "",
  currentContent: "",
  lastSavedAt: null,

  // ── 基础 set 方法 ─────────────────────────────────────────
  setNoteList: (list: NoteItem[]): void => set({ noteList: list }),
  setCurrentId: (id: string | null): void => set({ currentId: id }),
  setCurrentTitle: (title: string): void => set({ currentTitle: title }),
  setCurrentContent: (content: string): void => set({ currentContent: content }),
  setLastSavedAt: (time: string | null): void => set({ lastSavedAt: time }),

  // ── 异步操作 ──────────────────────────────────────────────
  fetchNoteList: async (): Promise<void> => {
    const list: NoteItem[] = await api.getList();
    set({ noteList: list });
  },

  selectNote: async (id: string): Promise<void> => {
    const detail = await api.getDetail(id);
    set({
      currentId: id,
      currentTitle: detail.title,
      currentContent: detail.content,
      // 初始化保存时间为文件的实际修改时间
      lastSavedAt: detail.updated_at,
    });
  },

  deleteNote: async (id: string): Promise<void> => {
    // 1. 调用后端软删除（文件移入回收站）
    await api.remove(id);
    // 2. 删除后刷新笔记列表
    const list: NoteItem[] = await api.getList();
    // 3. 若删除的是当前打开的笔记，清空选中态 → 界面自动回到欢迎页
    const state = get();
    if (state.currentId === id) {
      set({
        noteList: list,
        currentId: null,
        currentTitle: "",
        currentContent: "",
        lastSavedAt: null,
      });
    } else {
      set({ noteList: list });
    }
  },

  renameNote: async (oldId: string, newTitle: string): Promise<void> => {
    // 重命名当前笔记时，连同最新正文一起提交，避免重命名丢失未保存的编辑内容
    const state = get();
    const data: { title: string; content?: string } =
      state.currentId === oldId
        ? { title: newTitle, content: state.currentContent }
        : { title: newTitle };
    // 1. 调用后端更新标题（标题变更会重命名 .md 文件 → id 可能变化）
    const result = await api.update(oldId, data);
    // 2. 刷新笔记列表
    const list: NoteItem[] = await api.getList();
    // 3. 若重命名的是当前打开的笔记，同步选中态到新 id / 新标题
    if (state.currentId === oldId) {
      set({
        noteList: list,
        currentId: result.id,
        currentTitle: result.title,
        currentContent: result.content,
        lastSavedAt: result.updated_at,
      });
    } else {
      set({ noteList: list });
    }
  },

  togglePin: async (id: string): Promise<void> => {
    const state = get();
    const note = state.noteList.find((n) => n.id === id);
    if (!note) {
      return;
    }
    const nextPinned: boolean = !note.is_pinned;
    // 1. 乐观更新：立即翻转本地状态，让界面无延迟反馈
    set({
      noteList: state.noteList.map((n) =>
        n.id === id ? { ...n, is_pinned: nextPinned } : n,
      ),
    });
    try {
      // 2. 调用后端置顶 / 取消置顶接口（幂等）
      if (nextPinned) {
        await api.pinNote(id);
      } else {
        await api.unpinNote(id);
      }
    } catch (err: unknown) {
      // 3. 失败：刷新列表回滚为服务器真实状态，再抛出让调用方提示
      try {
        const list: NoteItem[] = await api.getList();
        set({ noteList: list });
      } catch {
        // 回滚刷新失败则忽略，下次刷新列表自然纠正
      }
      throw err;
    }
    // 成功：与后端对齐（确保 updated_at 等字段最新）
    try {
      const list: NoteItem[] = await api.getList();
      set({ noteList: list });
    } catch {
      // 对齐失败忽略，乐观更新的状态已正确
    }
  },
}));
