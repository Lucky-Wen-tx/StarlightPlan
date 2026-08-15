"use client";

/**
 * 底部状态栏
 * - 固定在编辑区底部
 * - 显示当前笔记字数、字符数和最后保存时间
 * - 未选中笔记时隐藏
 */
import { useMemo, useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";

/**
 * 统计文本字数（中文字符 + 英文单词混合计数）
 * - 每个 CJK 字符计为 1 字
 * - 拉丁字母按空白分割后计单词数
 */
function countWords(text: string): number {
  // 去除 Markdown 常用标记，保留正文内容
  const cleaned = text
    .replace(/[#*`~\[\]()>|\-_={}.!\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return 0;

  // 匹配 CJK 字符（含中文、日文、韩文汉字）
  const cjkMatches = cleaned.match(
    /[一-鿿㐀-䶿豈-﫿]/g,
  );
  const cjkCount: number = cjkMatches ? cjkMatches.length : 0;

  // 移除 CJK 后剩余文本，按空白分割计英文单词
  const nonCjk = cleaned
    .replace(/[一-鿿㐀-䶿豈-﫿]/g, " ")
    .trim();
  const latinWords: number = nonCjk
    ? nonCjk.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  return cjkCount + latinWords;
}

/**
 * 统计字符数（不含空白字符，去除 Markdown 标记）
 */
function countChars(text: string): number {
  return text
    .replace(/[#*`~\[\]()>|\-_={}.!\\]/g, "")
    .replace(/\s/g, "")
    .length;
}

/**
 * 格式化 ISO 时间为精确时间 "YYYY/M/D HH:mm"
 * - 年/月/日不补前导零，时/分补足两位
 * - 用于「30 天内」档位的正文显示
 */
function formatExactTime(date: Date): string {
  const year: number = date.getFullYear();
  const month: number = date.getMonth() + 1;
  const day: number = date.getDate();
  const hour: string = String(date.getHours()).padStart(2, "0");
  const minute: string = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

/**
 * 格式化 ISO 时间为完整精确时间 "YYYY/MM/DD HH:mm:ss"
 * - 月/日/时/分/秒均补足两位
 * - 用于 hover 时文本替换展示
 */
function formatFullTime(date: Date): string {
  const year: number = date.getFullYear();
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const day: string = String(date.getDate()).padStart(2, "0");
  const hour: string = String(date.getHours()).padStart(2, "0");
  const minute: string = String(date.getMinutes()).padStart(2, "0");
  const second: string = String(date.getSeconds()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

/**
 * 格式化 ISO 时间为相对/简短显示
 * 规则（除"刚刚保存"外均带"最后修改于"前缀）：
 * - < 1 分钟  → "刚刚保存"
 * - < 1 小时  → "最后修改于 X分钟前"
 * - < 30 天   → "最后修改于 YYYY/M/D HH:mm"
 * - ≥ 30 天   → "最后修改于 YYYY/M/D"
 */
function formatSaveTime(iso: string): string {
  const date: Date = new Date(iso);
  const now: Date = new Date();
  const diffSec: number = Math.floor((now.getTime() - date.getTime()) / 1000);

  // 时钟偏差导致的未来时间按"刚刚保存"兜底处理
  if (diffSec < 60) return "刚刚保存";

  // 1 小时内 → "最后修改于 X分钟前"（分钟数向下取整，最少 1 分钟）
  if (diffSec < 60 * 60) {
    return `${Math.floor(diffSec / 60)}分钟前`;
  }

  // 30 天内 → "最后修改于 YYYY/M/D HH:mm"
  if (diffSec < 30 * 24 * 60 * 60) {
    return `最后修改于 ${formatExactTime(date)}`;
  }

  // ≥ 30 天 → "最后修改于 YYYY/M/D"
  return `最后修改于 ${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export default function StatusBar(): React.ReactElement | null {
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const currentContent: string = useNoteStore((s) => s.currentContent);
  const lastSavedAt: string | null = useNoteStore((s) => s.lastSavedAt);

  /**
   * hover 状态：鼠标悬停时把保存时间文本直接替换为精确时间，
   * 移出后恢复为相对时间显示（替代原生 title 气泡）
   */
  const [hovered, setHovered] = useState<boolean>(false);

  // ── 基于内容实时计算统计 ──────────────────────────────────
  const wordCount: number = useMemo(
    () => countWords(currentContent),
    [currentContent],
  );
  const charCount: number = useMemo(
    () => countChars(currentContent),
    [currentContent],
  );

  // ── 未选中笔记 → 不渲染状态栏 ─────────────────────────────
  if (currentId === null || !lastSavedAt) {
    return null;
  }

  return (
    <div className="shrink-0 flex items-center justify-between px-6 py-1 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-[13px] text-neutral-400 dark:text-neutral-500 select-none">
      {/* 左侧：字数统计 */}
      <div className="flex items-center gap-4">
        <span>{wordCount} 字</span>
        <span>{charCount} 字符</span>
      </div>

      {/* 右侧：保存时间（hover 时文本直接替换为完整精确时间 YYYY/MM/DD HH:mm:ss） */}
      <span
        className="cursor-default"
        onMouseEnter={(): void => setHovered(true)}
        onMouseLeave={(): void => setHovered(false)}
      >
        {hovered
          ? formatFullTime(new Date(lastSavedAt))
          : formatSaveTime(lastSavedAt)}
      </span>
    </div>
  );
}
