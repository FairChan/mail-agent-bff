"use client";

import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedList({ children, className, delay = 50 }: AnimatedListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const items = containerRef.current?.querySelectorAll("[data-animate-item]");
    if (!items) return;

    items.forEach((item, index) => {
      (item as HTMLElement).style.animationDelay = `${index * delay}ms`;
      item.classList.add("animate-in");
    });
  }, [delay]);

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      {children}
    </div>
  );
}

export function AnimatedListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-animate-item
      className={cn(
        "opacity-0 translate-y-2",
        className
      )}
    >
      {children}
    </div>
  );
}
