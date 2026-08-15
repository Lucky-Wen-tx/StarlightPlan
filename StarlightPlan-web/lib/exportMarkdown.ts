/**
 * 自包含 Markdown 导出工具
 *
 * 导出笔记时，将 Markdown 中引用的后端图片（/api/assets/...）下载并
 * 转换为 base64 data URL 内嵌进正文，使导出的 .md 文件可在
 * 无后端环境（换机器 / 发给他人）下正常显示图片。
 *
 * 处理规则：
 * - 仅转换本后端的图片引用（含协议头的绝对 URL 或纯相对路径）
 * - 外部图片链接（非 /api/assets/）保持原样，不拉取，避免跨域与意外下载
 * - 单个图片下载失败时保留原链接并告警，不影响整体导出
 */
import { assetToDataUrl } from "@/lib/api";

// 匹配后端图片引用的正则：
//   绝对形式 http://host:port/api/assets/xxx.png
//   相对形式 /api/assets/xxx.png
// 文件名部分：字母数字、点、下划线、连字符（与后端 UUID 命名一致）
const ASSET_URL_RE = /(?:https?:\/\/[^/\s)]+)?\/api\/assets\/[\w.-]+/g;

/**
 * 将 Markdown 正文中的后端图片引用替换为 base64 data URL
 *
 * @param content - 原始 Markdown 正文
 * @returns 替换完成后的 Markdown（图片已内嵌）
 */
export async function buildPortableMarkdown(
  content: string,
): Promise<string> {
  // 没有后端图片引用 → 原样返回
  const urls: string[] = content.match(ASSET_URL_RE) ?? [];
  if (urls.length === 0) {
    return content;
  }

  // 去重后逐个下载并转 base64（同一图片只下载一次）
  const uniqueUrls: string[] = [...new Set(urls)];
  const replacements: Array<{ from: string; to: string } | null> =
    await Promise.all(
      uniqueUrls.map(async (url: string) => {
        try {
          const dataUrl: string = await assetToDataUrl(url);
          return { from: url, to: dataUrl };
        } catch (err: unknown) {
          // 单张图片失败不影响整体导出：保留原链接
          const message: string =
            err instanceof Error ? err.message : "未知错误";
          console.warn("[Export] 图片内嵌失败，保留原链接:", url, message);
          return null;
        }
      }),
    );

  let result: string = content;
  for (const replacement of replacements) {
    if (replacement) {
      result = result.replaceAll(replacement.from, replacement.to);
    }
  }
  return result;
}
