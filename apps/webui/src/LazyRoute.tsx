import { Suspense, type ReactNode } from "react";

interface LazyRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function LazyRoute({ children, fallback }: LazyRouteProps) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-2 border-zinc-300 border-t-zinc-600 rounded-full" />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  );
}
