/**
 * Markdown 大纲（目录）解析工具
 *
 * 从笔记正文（原始 Markdown 字符串）中提取标题结构，供编辑器右侧
 * 大纲面板展示与定位跳转使用。
 *
 * 实现说明（单遍逐行扫描，O(n)）：
 * - 支持 ATX 标题（# ~ ######）与 Setext 标题（下一行为 ==== / ----）
 * - 跳过围栏代码块（``` / ~~~）与缩进代码块内的疑似标题行，
 *   避免代码中的 `#` 被误判为大标题
 * - 剥离引用块行首的 `>` 标记，使 `> # 标题` 也能被正确识别，
 *   与编辑器渲染出的 DOM 顺序保持一致
 *
 * 已知边界：列表项内标题（`- # 标题`）为极少数用法，不单独识别，
 * 由点击定位时的文本交叉校验兜底（见 OutlinePanel）。
 */
export interface OutlineItem {
  /** 标题级别 1-6 */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 标题展示文本（已去除行内 Markdown 标记） */
  text: string;
}

/** ATX 标题：行首 1-6 个 # 后跟空白与正文 */
const ATX_HEADING_RE = /^(#{1,6})\s+(.+)$/;
/** 围栏代码块标记（``` 或 ~~~，允许前置空白） */
const FENCE_RE = /^\s*(```|~~~)/;
/** 缩进代码块：4 个空格或 Tab 开头 */
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
/** 引用块标记剥离：连续去除行首 `>`（及可选单个空格） */
const BLOCKQUOTE_RE = /^>\s?/;
/** Setext 标题下划线：全等号（h1）或全连字符（h2），至少 2 个字符 */
const SETEXT_EQ_RE = /^=+$/;
const SETEXT_DASH_RE = /^-+$/;

/**
 * 去除标题文本中的行内 Markdown 标记，得到干净的展示文本。
 * 刻意不处理下划线形式的粗斜体（`__x__` / `_x_`），避免破坏
 * 代码标识符（如 `# my_var`）这类常见的下划线内容。
 */
function stripInlineMarkdown(text: string): string {
  return text
    // 图片 → 取 alt 文本
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 链接 → 取链接文字
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // 行内代码 → 取代码内容
    .replace(/`([^`]+)`/g, "$1")
    // 粗体 **x** → x
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // 斜体 *x* → x
    .replace(/\*([^*]+)\*/g, "$1")
    // 删除线 ~~x~~ → x
    .replace(/~~([^~]+)~~/g, "$1")
    // 折叠连续空白并去掉首尾空白
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 从 Markdown 正文中提取大纲标题列表（按文档出现顺序）。
 */
export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines: string[] = markdown.split("\n");

  /** 是否处于围栏代码块内 */
  let inFence = false;
  /** 上一段普通段落文本（用于识别 Setext 标题） */
  let prevParagraph: string | null = null;

  for (const rawLine of lines) {
    // 空行：清空段落记忆，且不参与任何标题判定
    if (rawLine.trim() === "") {
      prevParagraph = null;
      continue;
    }

    // 围栏代码块标记：进入/退出围栏态，围栏内的行一律跳过
    if (FENCE_RE.test(rawLine)) {
      inFence = !inFence;
      prevParagraph = null;
      continue;
    }
    if (inFence) {
      continue;
    }

    // 缩进代码块：不可能是标题或 Setext 段落
    if (INDENTED_CODE_RE.test(rawLine)) {
      prevParagraph = null;
      continue;
    }

    // 剥离引用块标记，使 `> # 标题` 也能被识别
    let content = rawLine;
    while (BLOCKQUOTE_RE.test(content)) {
      content = content.replace(BLOCKQUOTE_RE, "");
    }

    // ATX 标题
    const atxMatch = ATX_HEADING_RE.exec(content);
    if (atxMatch) {
      const level = atxMatch[1].length as OutlineItem["level"];
      items.push({ level, text: stripInlineMarkdown(atxMatch[2].trim()) });
      prevParagraph = null;
      continue;
    }

    // Setext 标题：当前行为 ==== / ---- 且上一行为普通段落
    const prev = prevParagraph;
    prevParagraph = null; // 先清空，下面再按需赋值
    if (prev !== null && SETEXT_EQ_RE.test(content)) {
      items.push({ level: 1, text: stripInlineMarkdown(prev.trim()) });
      continue;
    }
    if (prev !== null && SETEXT_DASH_RE.test(content)) {
      items.push({ level: 2, text: stripInlineMarkdown(prev.trim()) });
      continue;
    }

    // 普通段落行：记录为可能的 Setext 标题正文
    prevParagraph = content;
  }

  return items;
}
