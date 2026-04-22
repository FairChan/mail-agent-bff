import type { ReactNode } from "react";
import { CalmButton, CalmSectionLabel, CalmSurface } from "../ui/Calm";

interface SidebarDrawerProps {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SidebarDrawer({ children, open, onOpenChange }: SidebarDrawerProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed left-3 top-3 z-30 rounded-[1rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] p-2.5 text-[color:var(--ink)] shadow-[var(--shadow-soft)] backdrop-blur-sm lg:hidden"
        aria-label="打开菜单"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(12,18,27,0.34)] backdrop-blur-sm lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <CalmSurface className="flex h-full flex-col rounded-none rounded-r-[1.6rem] border-l-0 p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-soft)] px-4 py-4">
            <div>
              <CalmSectionLabel>Navigation</CalmSectionLabel>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">导航菜单</p>
            </div>
            <CalmButton
              type="button"
              onClick={() => onOpenChange(false)}
              variant="ghost"
              className="h-10 w-10 rounded-full p-0"
              aria-label="关闭菜单"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </CalmButton>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">{children}</div>
        </CalmSurface>
      </div>
    </>
  );
}
