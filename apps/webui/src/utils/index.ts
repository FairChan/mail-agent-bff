import { sanitizeExternalLink, sanitizeHtml } from "./sanitize";

function renderInline(markdown: string): string {
  let rendered = sanitizeHtml(markdown);

  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = sanitizeExternalLink(href.trim());
    const safeLabel = sanitizeHtml(label.trim() || href.trim());
    if (!safeHref) {
      return safeLabel;
    }
    return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener" class="text-indigo-600 underline">${safeLabel}</a>`;
  });

  rendered = rendered.replace(/`([^`]+)`/g, "<code>$1</code>");
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return rendered;
}

export function renderSimpleMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    return "";
  }

  const chunks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      chunks.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      listItems.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    flushList();
    chunks.push(`<p>${renderInline(line)}</p>`);
  }

  flushList();
  return chunks.join("");
}
