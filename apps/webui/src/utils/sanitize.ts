/**
 * URL 安全化工具
 * 防止 XSS 和钓鱼攻击
 */

const ALLOWED_PROTOCOLS = new Set(["https:", "mailto:"]);

const DANGEROUS_PATTERNS = [
  /javascript:/i,
  /data:/i,
  /vbscript:/i,
  /file:/i,
];

export function sanitizeExternalLink(url: string | undefined | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // 检查协议
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    // 检查危险模式
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(url)) {
        return null;
      }
    }

    // 确保不是内部地址
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.endsWith(".internal") ||
      hostname === "[::1]"
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  // 基本 HTML 转义
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
