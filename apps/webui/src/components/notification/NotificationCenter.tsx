import { useState } from "react";

interface NotificationCenterProps {
  warnings?: Array<{ message: string }>;
  children?: React.ReactNode;
}

export function NotificationCenter({ warnings = [], children }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const unreadCount = warnings.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-zinc-100 transition-colors"
        aria-label="通知"
      >
        <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-zinc-200 z-50">
          <div className="p-3 border-b border-zinc-100">
            <h3 className="font-semibold text-sm text-zinc-700">通知</h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {warnings.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-400">暂无通知</div>
            ) : (
              warnings.map((w, i) => (
                <div key={i} className="p-3 border-b border-zinc-50 flex items-start gap-2 bg-amber-50">
                  <span className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <p className="text-sm text-zinc-700">{w.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
