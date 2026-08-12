"use client";

/**
 * 主页面
 * - 笔记视图：未选择笔记 → 欢迎引导页；已选择 → Milkdown 所见即所得编辑器
 * - 回收站视图：选中回收站笔记 → 只读 Markdown 预览；否则欢迎引导页
 */
import Image from "next/image";
import { Ma_Shan_Zheng } from "next/font/google";
import { useNoteStore } from "@/store/useNoteStore";
import { useRecycleStore } from "@/store/useRecycleStore";
import MilkdownEditor from "@/components/editor/MilkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";

/** 副标题书法字体（马山正行书） */
const subtitleFont = Ma_Shan_Zheng({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

/** 欢迎引导页（未选中任何笔记 / 回收站未选中时展示） */
function Welcome(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center select-none">
        {/* 图标 */}
        <div className="inline-flex items-center justify-center w-20 h-15 mb-5">
          <Image
            src="/ico_index.png"
            alt="拾光"
            width={55}
            height={55}
            unoptimized
          />
        </div>
        {/* 引导文案 */}
        <h2 className="text-2xl font-medium text-neutral-500 dark:text-neutral-400">
          拾光Plan
        </h2>
        <p
          className={`mt-2 text-lg text-neutral-400 dark:text-neutral-500 ${subtitleFont.className}`}
        >
          拾取星光，记录成长
        </p>
      </div>
    </div>
  );
}

export default function Home(): React.ReactElement {
  const currentId: string | null = useNoteStore((s) => s.currentId);
  const recycleIsOpen: boolean = useRecycleStore((s) => s.isOpen);
  const currentRecycleId: string | null = useRecycleStore(
    (s) => s.currentRecycleId,
  );
  const currentRecycleContent: string = useRecycleStore(
    (s) => s.currentRecycleContent,
  );

  // ── 回收站视图：选中笔记 → 只读预览；否则欢迎页 ──────────
  if (recycleIsOpen) {
    if (currentRecycleId) {
      // key 绑定笔记 ID：切换预览对象时强制重挂载，注入对应内容
      return (
        <MarkdownPreview key={currentRecycleId} content={currentRecycleContent} />
      );
    }
    return <Welcome />;
  }

  // ── 笔记视图：未选择笔记 → 欢迎页；已选择 → 编辑器 ──────
  if (!currentId) {
    return <Welcome />;
  }
  // key 绑定笔记 ID：切换笔记时强制重挂载编辑器，内容经 defaultValue 注入。
  // 避免在单实例上执行 replaceAll 时，块手柄(plugin-block)缓存的上篇笔记
  // position 在新文档上越界，引发 "Position N out of range" 运行时崩溃。
  return <MilkdownEditor key={currentId} />;
}
