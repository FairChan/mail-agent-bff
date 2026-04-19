import { useCallback, useEffect, useRef, useState } from "react";
import type { MailNotificationUrgentItem } from "@mail-agent/shared-types";
import { useMail } from "../../contexts/MailContext";
import { CalmButton, CalmPill, CalmSurface } from "../ui/Calm";

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
      data-testid="urgent-mail-toast-stack"
      aria-live="polite"
    >
      {items.map((item) => {
        const isSaving = savingKeys.has(item.key);
        const isSaved = savedKeys.has(item.key);
        return (
          <CalmSurface
            key={item.key}
            className="rise-in pointer-events-none p-3"
            tone="urgent"
            beam
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--pill-urgent-ink)]">
                  紧急重要邮件
                </p>
                {item.webLink ? (
                  <a
                    href={item.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="pointer-events-auto mt-1 block break-words text-sm font-semibold text-[color:var(--ink)] hover:underline"
                  >
                    {item.subject || "无主题邮件"}
                  </a>
                ) : (
                  <p className="mt-1 break-words text-sm font-semibold text-[color:var(--ink)]">
                    {item.subject || "无主题邮件"}
                  </p>
                )}
              </div>
              <CalmButton type="button" onClick={() => dismiss(item.key)} variant="ghost" className="pointer-events-auto px-2 py-1 text-xs">
                关闭
              </CalmButton>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
              {item.fromName || item.fromAddress || "未知发件人"} · {formatReceivedAt(item.receivedAt)}
            </p>
            {item.reasons.length > 0 && (
              <p className="mt-2 break-words text-xs text-[color:var(--ink-muted)]">
                {item.reasons.slice(0, 3).join(" · ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CalmButton
                type="button"
                onClick={() => void handleSaveCard(item)}
                disabled={isSaving || isSaved}
                variant="secondary"
                className="pointer-events-auto px-2.5 py-1.5 text-xs"
              >
                {isSaved ? "已存为知识卡片" : isSaving ? "保存中" : "存为知识卡片"}
              </CalmButton>
              <CalmPill tone={item.origin === "processing" ? "success" : "info"}>
                {item.origin === "processing" ? "自动预处理已完成" : "实时提醒"}
              </CalmPill>
            </div>
          </CalmSurface>
        );
      })}
    </div>
  );
}
