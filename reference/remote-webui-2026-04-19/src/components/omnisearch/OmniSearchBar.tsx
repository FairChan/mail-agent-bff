"use client";

import { useState, useCallback, useEffect } from "react";
import { FloatingButton } from "./FloatingButton";
import { SearchDialog } from "./SearchDialog";

interface OmniSearchBarProps {
  /**
   * 是否启用语音输入功能
   * @default true
   */
  enableVoiceInput?: boolean;
  /**
   * 搜索回调函数（可选，用于自定义搜索逻辑）
   */
  onSearch?: (query: string) => Promise<{ content: string; emailRefs: Array<any> }>;
  /**
   * 占位符文本
   * @default "用自然语言描述您想查找的内容..."
   */
  placeholder?: string;
}

/**
 * MERY 语义检索助手 - Omni-Search Bar
 *
 * 功能特性：
 * - 悬浮球随时唤醒
 * - 自然语言查询
 * - 语音输入支持
 * - 结果溯源与高亮
 * - 深色模式支持
 *
 * @example
 * ```tsx
 * <OmniSearchBar />
 * ```
 */
export function OmniSearchBar({
  enableVoiceInput = true,
  onSearch,
  placeholder = "用自然语言描述您想查找的内容...",
}: OmniSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 键盘快捷键：Cmd/Ctrl + K 打开
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      {/* 悬浮球按钮 */}
      <FloatingButton onClick={handleOpen} isOpen={isOpen} />

      {/* 搜索对话框 */}
      <SearchDialog
        isOpen={isOpen}
        onClose={handleClose}
      />
    </>
  );
}
