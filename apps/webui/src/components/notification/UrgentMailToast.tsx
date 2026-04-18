import { useCallback, useEffect, useRef, useState } from "react";
import type { MailNotificationUrgentItem } from "@mail-agent/shared-types";
import { useMail } from "../../contexts/MailContext";

type UrgentToastItem = MailNotificationUrgentItem & {
  sourceId: string;
  key: string;
  origin: "notification" | "processing";
  receivedAt: string;
};

function formatReceivedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "刚刚";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function UrgentMailToast() {
  const { activeSourceId, notificationSnapshot, processingResult, saveKnowledgeCard } = useMail();
  const [items, setItems] = useState<UrgentToastItem[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
  const seenKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    seenKeysRef.current.clear();
    setItems([]);
    setSavedKeys(new Set());
    setSavingKeys(new Set());
  }, [activeSourceId]);

  const enqueue = useCallback((sourceId: string, urgentItems: MailNotificationUrgentItem[], origin: UrgentToastItem["origin"]) => {
    if (urgentItems.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    const nextItems: UrgentToastItem[] = [];
    for (const item of urgentItems) {
      const key = `${sourceId}:${item.messageId}`;
      if (seenKeysRef.current.has(key)) {
        continue;
      }
      seenKeysRef.current.add(key);
      nextItems.push({
        ...item,
        sourceId,
        key,
        origin,
        receivedAt: item.receivedDateTime || now,
      });
    }
    if (nextItems.length === 0) {
      return;
    }
    setItems((current) => [...nextItems, ...current].slice(0, 3));
  }, []);

  useEffect(() => {
    if (!notificationSnapshot || notificationSnapshot.sourceId !== activeSourceId) {
      return;
    }
    enqueue(notificationSnapshot.sourceId, notificationSnapshot.urgent.newItems, "notification");
  }, [activeSourceId, enqueue, notificationSnapshot]);

  useEffect(() => {
    if (!processingResult || processingResult.sourceId !== activeSourceId || processingResult.trigger === "manual") {
      return;
    }
    enqueue(processingResult.sourceId, processingResult.urgent.newItems, "processing");
  }, [activeSourceId, enqueue, processingResult]);

  const dismiss = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const handleSaveCard = useCallback(async (item: UrgentToastItem) => {
    setSavingKeys((current) => new Set(current).add(item.key));
    try {
      await saveKnowledgeCard(item.messageId, ["urgent", "important"]);
      setSavedKeys((current) => new Set(current).add(item.key));
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current);
        next.delete(item.key);
        return next;
      });
    }
  }, [saveKnowledgeCard]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="紧急邮件提醒"
      className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => {
        const isSaving = savingKeys.has(item.key);
        const isSaved = savedKeys.has(item.key);
        return (
          <section
            key={item.key}
            className="rise-in pointer-events-none rounded-lg border border-red-200 bg-white p-3 shadow-xl dark:border-red-900/60 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                  紧急重要邮件
                </p>
                {item.webLink ? (
                  <a
                    href={item.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="pointer-events-auto mt-1 block break-words text-sm font-semibold text-zinc-950 hover:underline dark:text-zinc-50"
                  >
                    {item.subject || "无主题邮件"}
                  </a>
                ) : (
                  <p className="mt-1 break-words text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {item.subject || "无主题邮件"}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.key)}
                className="pointer-events-auto rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                关闭
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {item.fromName || item.fromAddress || "未知发件人"} · {formatReceivedAt(item.receivedAt)}
            </p>
            {item.reasons.length > 0 && (
              <p className="mt-2 break-words text-xs text-zinc-700 dark:text-zinc-300">
                {item.reasons.slice(0, 3).join(" · ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveCard(item)}
                disabled={isSaving || isSaved}
                className="pointer-events-auto rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300"
              >
                {isSaved ? "已存为知识卡片" : isSaving ? "保存中" : "存为知识卡片"}
              </button>
              <span className="text-[11px] text-zinc-400">
                {item.origin === "processing" ? "自动预处理已完成" : "实时提醒"}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
