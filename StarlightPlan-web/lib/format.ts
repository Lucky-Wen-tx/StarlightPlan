/**
 * 时间格式化工具（纯函数，前后端无关）
 *
 * 由 RecycleBin.tsx 原局部函数抽取，供回收站面板与设置弹窗共用，
 * 避免两处复制粘贴同一段逻辑。
 */

/**
 * 将 ISO 时间字符串格式化为 YYYY/MM/DD
 * @param iso - 后端返回的 ISO 8601 时间字符串
 * @returns 形如 2026/08/10；解析失败时返回「未知时间」兜底
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  const year: number = date.getFullYear();
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const day: string = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
