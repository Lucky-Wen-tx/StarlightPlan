"use client";

/**
 * 可滚动标题：笔记名过长时「走马灯」滚动展示全文
 *
 * 背景：笔记名过长时用省略号截断，所在笔记条目被悬浮时以走马灯
 * 连续单向滚动展示全文（从右向左、循环无缝衔接），替代 title 气泡。
 *
 * 触发方式：由父级笔记条目在「行级 hover」时传入 hovered=true，
 * 即鼠标悬浮在整条笔记上就触发动画，与条目自身的悬浮背景区域一致。
 *
 * 实现要点：
 * - 静止：渲染单份文本 + 省略号截断（与普通列表标题观感一致）；
 * - hovered 且超长：切换为「轨道 = 两遍文本」结构，轨道整体 translateX
 *   平移 50%（正好「一个文本宽度 + 间距」），第二遍无缝接上第一遍；
 * - 文本右侧留固定间距，避免两遍文本滚动时贴在一起；
 * - hovered 时测量「单份文本宽度 vs 可视宽度」，未超长则不滚动；
 * - hover 满 200ms 后才进入滚动态（快速划过条目不触发），延迟窗口内
 *   仍保持省略号截断态，动画启动时机由定时器控制，而非 animation-delay；
 * - hover 且标题确实超长（可触发滚动）时，可视容器左右两侧有渐变淡出遮罩
 *   （含 200ms 延迟内的截断态），文字滚入/滚出两端平滑，不露硬切割边缘
 *   （见 globals.css 中 .is-overflow-hover）；
 * - 文本不可选中（select-none），滚动时不会产生文字选中高亮，
 *   背景保持透明，与所在条目的悬浮背景色一致。
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

/** 两遍文本之间的固定间距（px），需与 globals.css 中 .scrollable-title-item 的 margin-right 一致 */
const MARQUEE_GAP = 32;
/** 悬浮后延迟进入滚动态的时长（ms）：快速划过条目不会立刻触发走马灯 */
const HOVER_SCROLL_DELAY = 200;

interface ScrollableTitleProps {
  /** 标题文本 */
  text: string;
  /** 所在笔记条目是否处于悬浮状态（由父级行 hover 驱动，整行悬浮即触发滚动） */
  hovered: boolean;
  /** 透传给根元素（控制字号、颜色等；截断/滚动样式由组件内部负责） */
  className?: string;
}

export default function ScrollableTitle({
  text,
  hovered,
  className = "",
}: ScrollableTitleProps): React.ReactElement {
  /** 静止态截断文本引用：用于测量文本实际宽度 */
  const truncateRef = useRef<HTMLSpanElement>(null);
  /** 溢出距离（单份文本宽度 - 可视宽度），0 表示未超长 */
  const [scrollDistance, setScrollDistance] = useState<number>(0);
  /** 走马灯循环时长（秒），按「文本宽度 + 间距」匀速折算 */
  const [scrollDuration, setScrollDuration] = useState<string>("10s");
  /** 延迟已过标记：hover 满 HOVER_SCROLL_DELAY 后由定时器回调置 true，作为滚动模式的真正开关 */
  const [scrollReady, setScrollReady] = useState<boolean>(false);

  // hover 结束时立即复位「延迟已过」标记，使下一次 hover 重新计算 200ms 延迟。
  // 采用 React 官方「在 render 期间调整 state」模式，避免在 effect 中同步 setState
  // （否则触发 react-hooks/set-state-in-effect 告警）。
  if (!hovered && scrollReady) {
    setScrollReady(false);
  }

  // 条目悬浮时测量溢出距离并折算走马灯时长。
  // 此刻仍处于 200ms 延迟窗口内，静止态 truncate 尚未被替换成轨道，可直接测量；
  // 滚动态的真正切换由下方 scrollReady 的延迟定时器控制。
  useEffect(() => {
    if (!hovered) return;
    const el = truncateRef.current;
    if (!el) return;
    const textWidth: number = el.scrollWidth; // 单份文本宽度
    const viewportWidth: number = el.clientWidth; // 可视宽度
    const overflow: number = Math.max(0, textWidth - viewportWidth);
    setScrollDistance(overflow);
    // 无缝循环每圈平移「一个文本宽度 + 间距」，按 ~50px/s 匀速（下限 2s）
    setScrollDuration(`${Math.max(2, (textWidth + MARQUEE_GAP) / 50)}s`);
  }, [hovered, text]);

  // hover 延迟进入滚动态：悬浮满 200ms 才开启动画，快速划过条目不触发；
  // 提前离开时定时器由 cleanup 清除，滚动态则随 isScrolling 中的 hovered 立即关断。
  // 注意：动画启动时机由这里的定时器回调控制，而非 CSS 的 animation-delay——
  // 用 animation-delay 时轨道（两遍全文）会先挂载定格 200ms，产生「全文静止露底」的顿挫；
  // 此处延迟期间仍保持省略号截断态，满 200ms 后轨道直接以动画启动，观感更平滑。
  useEffect(() => {
    if (!hovered) return;
    const timer = setTimeout(() => setScrollReady(true), HOVER_SCROLL_DELAY);
    return () => clearTimeout(timer);
  }, [hovered]);

  /** 仅当「当前悬浮」「延迟已过」且「确实超长」时才走马灯 */
  const isScrolling: boolean = hovered && scrollReady && scrollDistance > 0;
  /** hover 且确实超长（可触发滚动）时，可视容器左右两端显示渐变淡出遮罩 */
  const isOverflowHover: boolean = hovered && scrollDistance > 0;

  return (
    <span
      className={`scrollable-title ${isOverflowHover ? "is-overflow-hover" : ""} ${isScrolling ? "is-scrolling" : ""} ${className}`}
      style={{ "--scroll-duration": scrollDuration } as CSSProperties}
    >
      {isScrolling ? (
        /* 滚动：轨道渲染两遍文本，整体平移 50% 实现无缝走马灯 */
        <span className="scrollable-title-track">
          <span className="scrollable-title-item">{text}</span>
          <span className="scrollable-title-item">{text}</span>
        </span>
      ) : (
        /* 静止：省略号截断 */
        <span ref={truncateRef} className="scrollable-title-truncate">
          {text}
        </span>
      )}
    </span>
  );
}
