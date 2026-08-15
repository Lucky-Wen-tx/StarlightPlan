"use client";

/**
 * 主题管理 Hook + Provider
 *
 * 支持三种模式：light（浅色）| dark（深色）| system（跟随系统）
 * - 偏好存储于 localStorage key="theme"
 * - 通过 <html class="dark"> 控制 Tailwind darkMode: 'class'
 * - system 模式下监听 matchMedia 变化，实时切换
 * - 使用 useSyncExternalStore 保证 SSR/CSR 初始状态一致
 */
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

// ── 类型 ──────────────────────────────────────────────────────
export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: boolean;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
}

// ── 常量 ──────────────────────────────────────────────────────
const STORAGE_KEY = "theme";
const CYCLE_ORDER: ThemeMode[] = ["light", "dark", "system"];
const CHANGE_EVENT = "theme-changed";

// ── Context ───────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════
// 工具函数（纯函数，SSR 兼容）
// ═══════════════════════════════════════════════════════════════

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* 忽略 */ }
  return "system";
}

function resolve(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function nextMode(current: ThemeMode): ThemeMode {
  return CYCLE_ORDER[(CYCLE_ORDER.indexOf(current) + 1) % CYCLE_ORDER.length];
}

/** 订阅 localStorage 变更（跨标签页 + 同页面自定义事件） */
function subTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  // mode 走 useSyncExternalStore：hydration 时统一返回 "system"，之后切到真实值
  const mode: ThemeMode = useSyncExternalStore<ThemeMode>(
    subTheme,
    readStoredMode,
    () => "system" as ThemeMode,
  );

  // resolved 直接从 mode 派生，不单独建 store（避免时序问题）
  const resolved: boolean = resolve(mode);

  // 同步 <html class="dark">
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved);
  }, [resolved]);

  // system 模式：监听系统偏好变化
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (): void => {
      // 派发事件触发 useSyncExternalStore 重渲染以更新 resolved
      window.dispatchEvent(new Event(CHANGE_EVENT));
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  // 写入 localStorage + 通知订阅者
  const setMode = useCallback((m: ThemeMode): void => {
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const cycleMode = useCallback((): void => {
    setMode(nextMode(mode));
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, cycleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme() 必须在 <ThemeProvider> 内部使用");
  }
  return ctx;
}
