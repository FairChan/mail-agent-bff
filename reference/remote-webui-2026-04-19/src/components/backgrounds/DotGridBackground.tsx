"use client";

import { useEffect, useRef } from "react";

interface DotGridBackgroundProps {
  className?: string;
  dotColor?: string;
  dotSize?: number;
  spacing?: number;
}

export function DotGridBackground({ className, dotColor, dotSize, spacing }: DotGridBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;
    const size = dotSize ?? 1.5;
    const gap = spacing ?? 28;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const cols = Math.ceil(window.innerWidth / gap) + 1;
      const rows = Math.ceil(window.innerHeight / gap) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * gap;
          const y = j * gap;
          const wave = Math.sin((i + j) * 0.1 + t * 0.6) * 0.3 + 0.7;
          const alpha = wave * 0.18;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = dotColor
            ? `${dotColor}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
            : `rgba(100, 116, 139, ${alpha})`;
          ctx.fill();
        }
      }

      t += 0.015;
      animId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      cancelAnimationFrame(animId);
      draw();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  });

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
