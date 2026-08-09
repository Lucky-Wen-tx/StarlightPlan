/**
 * 笔记后端 API 封装
 * 所有请求统一经过 request() 处理：
 * - 成功时返回 JSON 解析结果
 * - 失败时抛出 Error，message 包含后端返回的 detail 字段
 */
import type { NoteItem, NoteDetail, NoteUpdateResult } from "@/types/note";

// ── 常量 ──────────────────────────────────────────────────────
/** 后端 API 基地址 */
const BASE_URL = "http://localhost:8000/api";
/** 后端服务源地址（图片上传返回的是相对路径 /api/assets/...，需拼接源地址） */
const ORIGIN = new URL(BASE_URL).origin;

// ═══════════════════════════════════════════════════════════════
// 内部请求封装
// ═══════════════════════════════════════════════════════════════

/**
 * 统一请求处理：
 * 1. 发起 fetch 请求
 * 2. 非 2xx 响应 → 尝试读取后端返回的 detail 字段并抛出 Error
 * 3. 2xx 响应 → 解析 JSON 并返回
 *
 * @throws {Error} 请求失败或后端返回错误时，message 包含 detail 信息
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response: Response = await fetch(url, options);

  if (!response.ok) {
    // 尝试从响应体中提取 FastAPI 的 detail 字段
    let detail: string;
    try {
      const errorBody: Record<string, unknown> = await response.json();
      detail =
        typeof errorBody.detail === "string"
          ? errorBody.detail
          : `请求失败 (HTTP ${response.status})`;
    } catch {
      // 响应体不是合法 JSON（如服务器完全不可达、返回 HTML 等）
      detail = `请求失败 (HTTP ${response.status}: ${response.statusText})`;
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

// ═══════════════════════════════════════════════════════════════
// 笔记 CRUD 接口
// ═══════════════════════════════════════════════════════════════

/**
 * 获取所有笔记的摘要列表（按修改时间倒序）
 * GET /api/notes
 */
export async function getList(): Promise<NoteItem[]> {
  return request<NoteItem[]>(`${BASE_URL}/notes`);
}

/**
 * 获取单篇笔记的完整内容
 * GET /api/notes/{noteId}
 *
 * @param noteId - 笔记唯一标识
 */
export async function getDetail(noteId: string): Promise<NoteDetail> {
  return request<NoteDetail>(`${BASE_URL}/notes/${encodeURIComponent(noteId)}`);
}

/**
 * 创建一篇新笔记
 * POST /api/notes
 *
 * @param title - 笔记标题（将作为 .md 文件名）
 */
export async function create(title: string): Promise<NoteDetail> {
  return request<NoteDetail>(`${BASE_URL}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

/**
 * 更新笔记（可单独修改内容，或同时修改标题和内容）
 * PUT /api/notes/{noteId}
 *
 * @param noteId - 笔记唯一标识
 * @param data   - 要更新的字段（title / content 至少传一个）
 */
export async function update(
  noteId: string,
  data: { title?: string; content?: string },
): Promise<NoteUpdateResult> {
  return request<NoteUpdateResult>(
    `${BASE_URL}/notes/${encodeURIComponent(noteId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

/**
 * 删除笔记（软删除：后端将文件移入回收站，可恢复）
 * DELETE /api/notes/{noteId}
 *
 * @param noteId - 笔记唯一标识
 */
export async function remove(noteId: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `${BASE_URL}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );
}

// ═══════════════════════════════════════════════════════════════
// 图片上传 / Markdown 导入接口
// ═══════════════════════════════════════════════════════════════

/**
 * 上传图片到后端存储
 * POST /api/images/upload（multipart/form-data，字段名 file）
 *
 * 后端返回 { url: "/api/assets/xxx.png" }，为相对路径；
 * 此处拼接后端源地址返回完整 URL，供编辑器直接渲染。
 *
 * @param file - 用户粘贴/拖入的图片文件
 * @returns 完整图片 URL（形如 http://localhost:8000/api/assets/xxx.png）
 */
export async function uploadImage(file: File): Promise<string> {
  // 注意：body 直接传 FormData，不要手动设置 Content-Type，
  // 浏览器会自动附带 multipart boundary
  const formData = new FormData();
  formData.append("file", file);

  const data = await request<{ url: string }>(`${BASE_URL}/images/upload`, {
    method: "POST",
    body: formData,
  });
  return `${ORIGIN}${data.url}`;
}

/**
 * 导入一篇 Markdown 文件为笔记
 * POST /api/notes/import（multipart/form-data，字段名 file）
 *
 * @param file - 用户选择的 .md 文件
 * @returns 导入后创建的笔记详情
 */
export async function importMarkdown(file: File): Promise<NoteDetail> {
  const formData = new FormData();
  formData.append("file", file);
  return request<NoteDetail>(`${BASE_URL}/notes/import`, {
    method: "POST",
    body: formData,
  });
}

/**
 * 将后端图片资源地址转为 base64 data URL
 * 用于自包含导出：下载图片字节后内嵌进 Markdown，
 * 导出的 .md 文件可在无后端环境（换机器/发他人）下正常显示图片。
 *
 * @param url - 后端图片地址，支持绝对 URL 或相对路径（如 /api/assets/xxx.png）
 * @returns base64 data URL（如 data:image/png;base64,...）
 * @throws 下载失败（HTTP 非 2xx）时抛出 Error
 */
export async function assetToDataUrl(url: string): Promise<string> {
  // 兼容相对路径：无协议头时拼接后端源地址
  const fullUrl: string = url.startsWith("/") ? `${ORIGIN}${url}` : url;
  const response: Response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`图片下载失败 (HTTP ${response.status})`);
  }
  const blob: Blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader: FileReader = new FileReader();
    reader.onload = (): void => resolve(reader.result as string);
    reader.onerror = (): void => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
