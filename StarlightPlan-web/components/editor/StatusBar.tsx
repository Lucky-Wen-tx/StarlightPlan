"use client";

/**
 * 底部状态栏
 * - 固定在编辑区底部
 * - 显示当前笔记字数、字符数和最后保存时间
 * - 未选中笔记时隐藏
 */
import { useMemo } from "react";
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
 * 格式化 ISO 时间为简短显示
 */
function formatSaveTime(iso: string): string {
  const date: Date = new Date(iso);
  const now: Date = new Date();
  const diffSec: number = Math.floor((now.getTime() - date.getTime()) / 1000);

  // 一分钟内 → "刚刚保存"
  if (diffSec < 60) return "刚刚保存";

  // 超过一分钟 → 显示文件的具体修改日期和时间
  const formatted = date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `最后修改于 ${formatted}`;
}

export default function StatusBar(): React.ReactElement | null {
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const currentContent: string = useNoteStore((s) => s.currentContent);
  const lastSavedAt: string | null = useNoteStore((s) => s.lastSavedAt);

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

      {/* 右侧：保存时间 */}
      <span>{formatSaveTime(lastSavedAt)}</span>
    </div>
  );
}
