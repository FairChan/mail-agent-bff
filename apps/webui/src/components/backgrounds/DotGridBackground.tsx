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

    let animationFrame = 0;
    let tick = 0;
    const radius = dotSize ?? 1.4;
    const gap = spacing ?? 28;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const columns = Math.ceil(window.innerWidth / gap) + 1;
      const rows = Math.ceil(window.innerHeight / gap) + 1;

      for (let xIndex = 0; xIndex < columns; xIndex += 1) {
        for (let yIndex = 0; yIndex < rows; yIndex += 1) {
          const x = xIndex * gap;
          const y = yIndex * gap;
          const wave = Math.sin((xIndex + yIndex) * 0.1 + tick * 0.6) * 0.25 + 0.7;
          const alpha = wave * 0.18;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = dotColor
            ? `${dotColor}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
            : `rgba(96, 165, 250, ${alpha})`;
          ctx.fill();
        }
      }

      tick += 0.015;
      animationFrame = window.requestAnimationFrame(draw);
    };

    const handleResize = () => {
      window.cancelAnimationFrame(animationFrame);
      draw();
    };

    draw();
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [dotColor, dotSize, spacing]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
