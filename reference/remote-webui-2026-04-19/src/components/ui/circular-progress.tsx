"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showValue?: boolean;
  color?: string;
}

export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 6,
  className,
  showValue = true,
  color = "var(--accent)",
}: CircularProgressProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const circumference = 2 * Math.PI * ((size - strokeWidth) / 2);
  const offset = circumference - (displayValue / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setDisplayValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - strokeWidth) / 2}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-zinc-200 dark:stroke-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - strokeWidth) / 2}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ stroke: color, transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      {showValue && (
        <span className="absolute text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {displayValue}%
        </span>
      )}
    </div>
  );
}
