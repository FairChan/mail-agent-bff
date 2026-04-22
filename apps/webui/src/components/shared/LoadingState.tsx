interface LoadingStateProps {
  rows?: number;
  height?: number;
}

export function SkeletonBlock({ className = "h-4 rounded" }: { className?: string }) {
  return (
    <div
      className={`bg-[rgba(223,230,240,0.9)] dark:bg-[rgba(40,50,66,0.92)] ${className}`}
      aria-hidden="true"
    />
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-3" aria-label="加载中">
      <SkeletonBlock className="h-10 w-full rounded-[1rem]" />
      <SkeletonBlock className="h-10 w-full rounded-[1rem]" />
      <SkeletonBlock className="h-10 w-full rounded-[1rem]" />
      <SkeletonBlock className="h-10 w-1/2 rounded-[1rem]" />
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
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-3 shadow-[var(--shadow-inset)]"
        >
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex justify-between gap-3">
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
