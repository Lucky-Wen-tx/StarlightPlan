/**
 * 笔记相关类型定义
 * 字段一一对应后端 Pydantic 模型的 JSON 序列化结果：
 * - NoteSummary → NoteItem
 * - NoteDetail  → NoteDetail
 * - update_note 返回值 → NoteUpdateResult（字段与 NoteDetail 一致，
 *   但 update 可能因标题变更导致 id 变化，故独立定义以明确语义）
 *
 * 后端 datetime 字段经 FastAPI JSON 序列化后为 ISO 8601 字符串
 */

// ── 笔记列表项（对应后端 NoteSummary）──────────────────────────
export interface NoteItem {
  /** 笔记唯一标识（即文件名去除 .md 后缀） */
  id: string;
  /** 笔记显示标题（取自文件内一级标题或文件名） */
  title: string;
  /** 文件创建时间（ISO 8601 字符串） */
  created_at: string;
  /** 文件最后修改时间（ISO 8601 字符串） */
  updated_at: string;
  /** 是否置顶（置顶笔记在侧边栏置顶区展示） */
  is_pinned: boolean;
}

// ── 笔记详情（对应后端 NoteDetail，继承 NoteSummary）───────────
export interface NoteDetail extends NoteItem {
  /** 笔记完整 Markdown 正文 */
  content: string;
}

// ── 更新笔记结果（update 端点返回 NoteDetail，但 id 可能因重命名变更）──
export interface NoteUpdateResult {
  /** 笔记唯一标识（标题变更时可能不同于请求中的 noteId） */
  id: string;
  /** 笔记显示标题 */
  title: string;
  /** 笔记完整 Markdown 正文 */
  content: string;
  /** 文件创建时间（ISO 8601 字符串） */
  created_at: string;
  /** 文件最后修改时间（ISO 8601 字符串） */
  updated_at: string;
  /** 是否置顶 */
  is_pinned: boolean;
}
