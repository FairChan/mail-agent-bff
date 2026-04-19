"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface FloatingButtonProps {
  onClick: () => void;
  isOpen?: boolean;
}

export function FloatingButton({ onClick, isOpen = false }: FloatingButtonProps) {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current + 50) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY.current - 50) {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full",
        "bg-blue-600 text-white shadow-lg",
        "transition-all duration-300 hover:scale-110 hover:shadow-xl hover:bg-blue-700",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        isOpen && "scale-0 opacity-0",
        !isVisible && "translate-y-20 opacity-0"
      )}
      aria-label="打开语义搜索"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  );
}
