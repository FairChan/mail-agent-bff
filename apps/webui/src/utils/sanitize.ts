/**
 * URL / HTML safety helpers.
 * Keep all dangerous HTML rendering policy in one place.
 */

import DOMPurify from "dompurify";

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
    const normalizedHref = parsed.href;

    // 检查协议
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    // 检查危险模式
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(url) || pattern.test(normalizedHref)) {
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

    return normalizedHref;
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

function decodeCommonEntities(content: string): string {
  return content
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hardenSanitizedLinks(html: string): string {
  if (typeof document === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const anchor of template.content.querySelectorAll("a")) {
    const href = sanitizeExternalLink(anchor.getAttribute("href"));
    if (!href) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      continue;
    }

    anchor.setAttribute("href", href);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer noopener");
  }

  return template.innerHTML;
}

export function sanitizeMailBodyHtml(content: string | undefined | null): string {
  if (!content) return "";

  const decoded = decodeCommonEntities(content);
  if (!/<[a-z!/][^>]*>/i.test(decoded)) {
    return sanitizeHtml(decoded).replace(/\n/g, "<br />");
  }

  const sanitized = DOMPurify.sanitize(decoded, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "blockquote",
      "br",
      "code",
      "div",
      "em",
      "i",
      "li",
      "ol",
      "p",
      "pre",
      "span",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "title"],
    FORBID_TAGS: ["form", "iframe", "img", "input", "script", "style", "svg", "video"],
  });

  return hardenSanitizedLinks(sanitized);
}
