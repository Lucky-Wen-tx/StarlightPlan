"use client";

/**
 * 编辑器右侧大纲（目录）浮层面板
 *
 * 以浮层形式盖在编辑器右侧上方（不挤压编辑器宽度），展开时从右侧
 * 滑入、收起时向右滑出。从 store 中的当前笔记正文实时解析标题结构
 * （与编辑器内容同源，切换笔记时 `selectNote` 会同步更新
 * currentContent，故面板即时正确），按标题级别缩进展示，点击条目
 * 平滑滚动定位到编辑器对应章节。
 *
 * 定位原理：
 * - 主匹配：按「(标题级别, 同级次序)」在编辑器 DOM 中寻找对应
 *   h1~h6 元素——顺序匹配天然规避行内格式差异与重复标题；
 * - 兜底：主匹配位置的文本与面板展示不一致时（如列表项内标题被
 *   扫描器跳过导致的次序偏移），改为按「级别 + 归一化文本」在
 *   文档顺序中检索，仍找不到则静默不滚动。
 */
import { useMemo, type RefObject } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import { extractOutline, type OutlineItem } from "@/lib/outline";

interface OutlinePanelProps {
  /** 编辑器滚动容器引用（MilkdownEditor 中 absolute inset-0 overflow-y-auto 的 div） */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** 是否展开：控制滑入（translate-x-0）/ 滑出（translate-x-full）动画 */
  open: boolean;
}

/**
 * 归一化文本：折叠连续空白并去首尾空白，
 * 使 DOM 的 textContent 与面板展示文本可比对。
 */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export default function OutlinePanel({
  scrollContainerRef,
  open,
}: OutlinePanelProps): React.ReactElement {
  // ── 从 store 读取当前笔记正文，实时解析大纲 ────────────────
  const currentContent: string = useNoteStore((s) => s.currentContent);
  const items: OutlineItem[] = useMemo(
    () => extractOutline(currentContent),
    [currentContent],
  );

  // ── 点击条目：滚动编辑器到对应标题 ────────────────────────
  const handleScrollTo = (itemIndex: number): void => {
    const container: HTMLDivElement | null = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const item: OutlineItem = items[itemIndex];
    if (!item) {
      return;
    }

    // 收集编辑器内的标题元素（Milkdown 将标题渲染为标准 h1~h6）
    const headingEls: Element[] = Array.from(
      container.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    );
    if (headingEls.length === 0) {
      return;
    }

    // 计算该条目在「同级标题」中的次序
    let indexWithinLevel = 0;
    for (let k = 0; k < itemIndex; k++) {
      if (items[k].level === item.level) {
        indexWithinLevel++;
      }
    }

    // ── 主匹配：按 (级别, 同级次序) 定位 ─────────────────────
    let domIndexWithinLevel = 0;
    for (const el of headingEls) {
      const elLevel = Number(el.tagName.charAt(1));
      if (elLevel !== item.level) {
        continue;
      }
      if (domIndexWithinLevel === indexWithinLevel) {
        // 文本交叉校验：一致才滚动，不一致进入兜底检索
        if (normalizeText(el.textContent ?? "") === item.text) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      domIndexWithinLevel++;
    }

    // ── 兜底：按「级别 + 归一化文本」在文档顺序中检索 ─────────
    for (const el of headingEls) {
      const elLevel = Number(el.tagName.charAt(1));
      if (
        elLevel === item.level &&
        normalizeText(el.textContent ?? "") === item.text
      ) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  };

  return (
    <aside
      className={`absolute top-1 right-0 bottom-0 z-20 w-[200px] flex flex-col border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-[-4px_0_16px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_16px_rgba(0,0,0,0.3)] transform-gpu transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
    >
      {/* 面板标题行 */}
      <div className="shrink-0 h-10 flex items-center px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
        大纲
      </div>

      {/* 空态：正文暂无标题 */}
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed select-none">
            暂无标题
          </p>
        </div>
      ) : (
        /* 标题列表：按级别缩进，点击平滑定位 */
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item, index) => (
            <button
              key={`${item.level}-${item.text}-${index}`}
              type="button"
              onClick={() => handleScrollTo(index)}
              title={item.text}
              className="block w-full truncate px-2 py-1 text-[13px] leading-5 text-left text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              style={{ paddingLeft: (item.level - 1) * 12 }}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
