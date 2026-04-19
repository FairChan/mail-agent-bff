"use client";

import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800",
        className
      )}
    />
  );
}

export function MailCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200/60 bg-white/60 p-4 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/60">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-40" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200/60 bg-white/60 p-4 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-zinc-950/60">
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="h-8 w-12" />
    </div>
  );
}
