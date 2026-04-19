import React from "react";
import { cn } from "../../lib/utils";

type WorkspaceWindowProps = {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  fullBleed?: boolean;
};

export function WorkspaceWindow({ title, eyebrow, children, fullBleed = false }: WorkspaceWindowProps) {
  return (
    <section
      className={cn(
        "workspace-window rise-in mx-auto flex min-h-full w-full flex-col overflow-hidden rounded-[1.9rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-base)] shadow-[var(--shadow-card)] backdrop-blur-2xl",
        fullBleed ? "max-w-none" : "max-w-7xl"
      )}
      aria-labelledby="workspace-window-title"
    >
      <span id="workspace-window-title" className="sr-only">
        {title}
      </span>

      <div className="border-b border-[color:var(--border-soft)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffb766]/80" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#69d4a7]/80" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#8aaaf8]/80" aria-hidden="true" />
          <div className="ml-2 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">{eyebrow}</p>
            <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{title}</p>
          </div>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1", fullBleed ? "p-2 sm:p-3" : "p-3 sm:p-4 lg:p-5")}>
        {children}
      </div>
    </section>
  );
}
