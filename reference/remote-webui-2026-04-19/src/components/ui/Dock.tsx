'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
  type SpringOptions,
} from 'motion/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

export type DockItemData = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  labelBreakpoint?: number; // 窗口宽度阈值，超过显示文字
  labelWidth?: number; // 标签区域宽度（px）
};

const GAP = 8; // gap-2 = 0.5rem = 8px

type DockItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  isActive?: boolean;
  showLabels: boolean;
  labelWidth: number;
};

function DockItem({
  icon,
  label,
  onClick,
  mouseX,
  spring,
  distance,
  baseItemSize,
  magnification,
  isActive,
  showLabels,
  labelWidth,
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseItemSize };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  // 总宽度 = 图标尺寸 + (标签宽度 + 间隙) 或仅图标尺寸
  const totalWidth = useTransform(size, (s) => (showLabels ? s + labelWidth + GAP : s));

  return (
    <motion.div
      ref={ref}
      style={{ width: totalWidth, height: size }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative flex cursor-pointer items-center rounded-2xl border border-white/20 shadow-lg transition-colors ${
        isActive ? 'bg-blue-500 shadow-blue-500/30' : 'bg-zinc-800'
      } ${showLabels ? 'gap-2 px-2' : 'justify-center'}`}
      role="button"
      tabIndex={0}
    >
      {/* 图标容器（会缩放） */}
      <motion.div style={{ width: size, height: size }} className="flex items-center justify-center text-white">
        {icon}
      </motion.div>

      {/* 内联标签（宽屏时显示） */}
      {showLabels && (
        <div className="truncate text-xs font-medium text-white" style={{ width: labelWidth }}>
          {label}
        </div>
      )}

      {/* Tooltip（始终显示，悬停时） */}
      <DockLabel isHovered={isHovered}>{label}</DockLabel>
    </motion.div>
  );
}

type DockLabelProps = {
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockLabel({ children, isHovered }: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', (latest) => setIsVisible(latest === 1));
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: -8 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute -top-6 left-1/2 w-fit whitespace-nowrap rounded-lg border border-white/20 bg-zinc-900 px-2 py-1 text-xs font-medium text-white shadow-xl"
          style={{ x: '-50%' }}
          role="tooltip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 64,
  distance = 200,
  panelHeight = 64,
  dockHeight = 280,
  baseItemSize = 48,
  labelBreakpoint = 800,
  labelWidth = 80,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxHeight = useMemo(() => Math.max(dockHeight, magnification + 40), [magnification, dockHeight]);
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  // 响应式：根据窗口宽度决定是否显示标签
  const [showLabels, setShowLabels] = useState(false);
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setShowLabels(winW > labelBreakpoint);
  }, [winW, labelBreakpoint]);

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none">
      <motion.div style={{ height }} className="pointer-events-auto flex items-end">
        <motion.div
          onMouseMove={({ pageX }) => {
            isHovered.set(1);
            mouseX.set(pageX);
          }}
          onMouseLeave={() => {
            isHovered.set(0);
            mouseX.set(Infinity);
          }}
          className={`flex items-end gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 px-4 pb-2 shadow-2xl backdrop-blur-xl ${className}`}
          style={{ height: panelHeight }}
          role="toolbar"
          aria-label="Navigation dock"
        >
          {items.map((item, index) => (
            <DockItem
              key={index}
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
              mouseX={mouseX}
              spring={spring}
              distance={distance}
              magnification={magnification}
              baseItemSize={baseItemSize}
              isActive={item.isActive}
              showLabels={showLabels}
              labelWidth={labelWidth}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
