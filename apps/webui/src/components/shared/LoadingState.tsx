import { type ReactNode } from "react";

interface LoadingStateProps {
  /** 骨架屏行数 */
  rows?: number;
  /** 自定义高度（px）*/
  height?: number;
}

export function SkeletonBlock({ className = "h-4 rounded" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-zinc-200 ${className}`}
      aria-hidden="true"
    />
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-3" aria-label="加载中">
      <SkeletonBlock className="h-10 w-full rounded-lg" />
      <SkeletonBlock className="h-10 w-full rounded-lg" />
      <SkeletonBlock className="h-10 w-full rounded-lg" />
      <SkeletonBlock className="h-10 w-1/2 rounded-lg" />
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="space-y-3" aria-label="加载收件箱">
      <div className="flex gap-3">
        <SkeletonBlock className="h-4 w-24 rounded" />
        <SkeletonBlock className="h-4 w-16 rounded" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white p-3">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex justify-between">
              <SkeletonBlock className="h-3 w-32 rounded" />
              <SkeletonBlock className="h-3 w-16 rounded" />
            </div>
            <SkeletonBlock className="h-3 w-full rounded" />
            <SkeletonBlock className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
