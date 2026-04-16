import { useState, type ReactNode } from "react";

interface SidebarDrawerProps {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SidebarDrawer({ children, open, onOpenChange }: SidebarDrawerProps) {
  return (
    <>
      {/* Mobile menu button — visible only on small screens */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white/80 backdrop-blur shadow-sm border border-zinc-200 lg:hidden"
        aria-label="打开菜单"
      >
        <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Backdrop — click to close */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel — slides in from left */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full bg-white shadow-xl border-r border-zinc-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-100">
            <span className="font-bold text-zinc-800">导航菜单</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-zinc-100"
              aria-label="关闭菜单"
            >
              <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation content */}
          <div className="flex-1 overflow-y-auto p-3">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
