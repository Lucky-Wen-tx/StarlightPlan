/**
 * 全局 UI 状态管理（zustand）
 *
 * 维护与业务数据无关的界面开关类状态。
 * 当前仅包含大纲（目录）面板的展开开关，供顶部工具栏按钮
 * 与编辑器侧边面板共同读写。
 */
import { create } from "zustand";

// ── Store 类型定义 ────────────────────────────────────────────
interface UiStore {
  // ── 状态 ──────────────────────────────────────────────────
  /** 大纲（目录）面板是否展开，true 时编辑器右侧展示大纲 */
  outlineOpen: boolean;

  // ── 操作 ──────────────────────────────────────────────────
  /** 设置大纲面板展开状态 */
  setOutlineOpen: (open: boolean) => void;
  /** 切换大纲面板展开状态 */
  toggleOutline: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Store 实例
// ═══════════════════════════════════════════════════════════════
export const useUiStore = create<UiStore>((set) => ({
  // ── 初始状态 ──────────────────────────────────────────────
  outlineOpen: false,

  // ── 操作 ──────────────────────────────────────────────────
  setOutlineOpen: (open: boolean): void => set({ outlineOpen: open }),
  toggleOutline: (): void => set((state) => ({ outlineOpen: !state.outlineOpen })),
}));
