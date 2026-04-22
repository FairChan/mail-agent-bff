import { CalmPill, CalmSectionLabel } from "../ui/Calm";
import type { ArtifactContentDetailDrawerProps } from "./drawerStore";

function prettyPrintContent(content: ArtifactContentDetailDrawerProps["content"]) {
  if (!content) {
    return "";
  }
  if (content.kind !== "json") {
    return content.content;
  }
  try {
    return JSON.stringify(JSON.parse(content.content), null, 2);
  } catch {
    return content.content;
  }
}

export function ArtifactContentDetailDrawer({
  artifact,
  content,
  baselineReady,
  error,
}: ArtifactContentDetailDrawerProps) {
  const printableContent = prettyPrintContent(content);

  return (
    <article className="flex h-full flex-col">
      <header className="relative overflow-hidden border-b border-[color:var(--border-soft)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(246,249,252,0.94))] px-6 pb-6 pt-7 dark:bg-[linear-gradient(135deg,rgba(18,24,34,0.98),rgba(30,33,43,0.82))] sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-60 w-60 rounded-full bg-slate-300/24 blur-3xl" />
        <div className="relative pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <CalmPill tone="info">Knowledge Document</CalmPill>
            <CalmPill tone={baselineReady ? "success" : "warning"}>
              {baselineReady ? "Backfill Ready" : "Still Syncing"}
            </CalmPill>
            {content?.kind ? <CalmPill tone="muted">{content.kind.toUpperCase()}</CalmPill> : null}
          </div>
          <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
            {content?.label ?? artifact.label}
          </h2>
          <p className="mt-3 break-all font-mono text-xs leading-5 text-[color:var(--ink-subtle)]">
            {content?.path ?? artifact.path}
          </p>
        </div>
      </header>

      <div className="calm-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        {error ? (
          <div className="mb-5 rounded-[1.05rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
            {error}
          </div>
        ) : null}

        <section>
          <CalmSectionLabel>Source</CalmSectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.05rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">Artifact Key</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold text-[color:var(--ink)]">{artifact.key}</p>
            </div>
            <div className="rounded-[1.05rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">Readiness</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                {baselineReady ? "旧邮件归档完成" : "旧邮件归档仍在持续更新"}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <CalmSectionLabel>Content</CalmSectionLabel>
          <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-[rgba(118,136,170,0.18)] bg-[radial-gradient(circle_at_top,rgba(22,30,46,0.98),rgba(10,14,22,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <pre className="max-h-[calc(100vh-23rem)] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-100">
              {printableContent.trim() ? printableContent : "该文档尚未生成内容。"}
            </pre>
          </div>
        </section>
      </div>
    </article>
  );
}
