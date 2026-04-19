"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export function RippleButton({ children, className, ...props }: RippleButtonProps) {
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();

    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  };

  return (
    <button
      ref={buttonRef}
      onClick={(e) => {
        handleClick(e);
        props.onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
      className={cn(
        "relative overflow-hidden rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full bg-white/30"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 0,
            height: 0,
            transform: "translate(-50%, -50%)",
            animation: "ripple-animate 0.6s ease-out forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes ripple-animate {
          to {
            width: 300px;
            height: 300px;
            opacity: 0;
          }
        }
      `}</style>
    </button>
  );
}
