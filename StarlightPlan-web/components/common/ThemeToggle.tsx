"use client";

/**
 * 主题切换按钮
 * 三态循环：light → dark → system
 * 图标：Sun（浅色）/ Moon（深色）/ Monitor（跟随系统）
 *
 * hydration 期间 ThemeProvider 统一返回 "system"，服务端/客户端
 * 均渲染 Monitor 图标，天然无 mismatch，无需额外占位逻辑。
 */
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { ThemeMode } from "@/hooks/useTheme";

const ICON_MAP: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL_MAP: Record<ThemeMode, string> = {
  light: "当前：浅色模式 — 点击切换",
  dark: "当前：深色模式 — 点击切换",
  system: "当前：跟随系统 — 点击切换",
};

export default function ThemeToggle(): React.ReactElement {
  const { mode, cycleMode } = useTheme();
  const Icon = ICON_MAP[mode];
  const label = LABEL_MAP[mode];

  return (
    <button
      type="button"
      onClick={cycleMode}
      title={label}
      aria-label={label}
      className="cursor-pointer p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
    >
      <Icon size={18} />
    </button>
  );
}
