export function LoadingSkeleton() {
  return (
    <div
      className="space-y-4 rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-inset)]"
      role="status"
      aria-live="polite"
      aria-label="加载中"
    >
      <div className="h-4 w-3/4 rounded bg-[rgba(223,230,240,0.9)] dark:bg-[rgba(40,50,66,0.92)]" />
      <div className="h-4 w-1/2 rounded bg-[rgba(223,230,240,0.9)] dark:bg-[rgba(40,50,66,0.92)]" />
      <div className="h-4 w-5/6 rounded bg-[rgba(223,230,240,0.9)] dark:bg-[rgba(40,50,66,0.92)]" />
    </div>
  );
}
