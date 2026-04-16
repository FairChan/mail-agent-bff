/**
 * 错误边界组件
 * 捕获子组件的 JavaScript 错误，防止整个应用崩溃
 */

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8">
          <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
            <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
              出错了
            </h2>
            <p className="mb-4 text-sm text-red-500 dark:text-red-300">
              {this.state.error?.message || "发生了未知错误"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 异步错误处理钩子
 */
export function useAsyncError() {
  const [, setError] = React.useState();

  return React.useCallback(
    (error: Error) =>
      setError(() => {
        throw error;
      }),
    []
  );
}

/**
 * 错误展示组件
 */
interface ErrorDisplayProps {
  error: Error | string | null;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, onRetry, className = "" }: ErrorDisplayProps) {
  const message = typeof error === "string" ? error : error?.message || "发生错误";

  return (
    <div className={`flex flex-col items-center gap-3 p-4 ${className}`}>
      <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          重试
        </button>
      )}
    </div>
  );
}
