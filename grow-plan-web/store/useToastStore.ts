/**
 * 轻提示（Toast）全局状态管理（zustand）
 *
 * 替代 window.alert 的轻量错误反馈：showToast() 展示一条提示，
 * 约 3 秒后自动消失；ToastContainer 在根布局挂载一次，统一渲染。
 * 与 useNoteStore 同构，沿用项目既有的 zustand 写法。
 */
import { create } from "zustand";

/** 单条提示 */
interface ToastItem {
  /** 唯一标识（模块级自增），用于精确移除 */
  id: number;
  /** 提示文案 */
  message: string;
}

interface ToastStore {
  /** 当前所有待展示的提示（后进显示在最上方） */
  toasts: ToastItem[];
  /** 显示一条提示，约 3 秒后自动消失 */
  showToast: (message: string) => void;
  /** 手动移除指定提示（自动消失的兜底路径） */
  removeToast: (id: number) => void;
}

/** 提示自动消失时长（毫秒） */
const TOAST_DURATION = 3000;

/** 自增 ID 计数器（模块级，跨组件共享，避免重复） */
let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  showToast: (message: string): void => {
    const id = nextId++;
    // 追加新提示
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    // 定时自动移除（每次调用独立计时，互不干扰）
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, TOAST_DURATION);
  },

  removeToast: (id: number): void => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
