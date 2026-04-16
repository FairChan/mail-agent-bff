export function LoadingSkeleton() {
  return (
    <div
      className="animate-pulse space-y-4 p-4"
      role="status"
      aria-live="polite"
      aria-label="加载中"
    >
      <div className="h-4 w-3/4 rounded bg-zinc-200" />
      <div className="h-4 w-1/2 rounded bg-zinc-200" />
      <div className="h-4 w-5/6 rounded bg-zinc-200" />
    </div>
  );
}
