import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MailPersonalizationFeedbackInput } from "@mail-agent/shared-types";
import { useMail } from "../contexts/MailContext";

type DetailFeedbackSessionOptions = {
  enabled: boolean;
  targetType: MailPersonalizationFeedbackInput["targetType"];
  targetId: string;
  quadrant?: MailPersonalizationFeedbackInput["quadrant"];
  context?: MailPersonalizationFeedbackInput["context"];
};

export function useDetailFeedbackSession(options: DetailFeedbackSessionOptions) {
  const { activeSourceId, recordPersonalizationFeedback } = useMail();
  const sessionKey = useMemo(
    () => `${activeSourceId ?? "no-source"}:${options.targetType}:${options.targetId}:${options.quadrant ?? "auto"}`,
    [activeSourceId, options.quadrant, options.targetId, options.targetType]
  );
  const activeSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const flushedKeyRef = useRef<string | null>(null);
  const sessionSourceIdRef = useRef<string | null>(null);

  const flush = useCallback(async () => {
    if (!options.enabled || !options.targetId || flushedKeyRef.current === sessionKey) {
      return;
    }

    if (activeSinceRef.current) {
      accumulatedRef.current += Date.now() - activeSinceRef.current;
      activeSinceRef.current = null;
    }

    const dwellMs = accumulatedRef.current;
    accumulatedRef.current = 0;
    flushedKeyRef.current = sessionKey;

    await recordPersonalizationFeedback(
      [
        {
          targetType: options.targetType,
          targetId: options.targetId,
          eventType: "detail_view",
          dwellMs,
          quadrant: options.quadrant,
          context: options.context,
        },
      ],
      { silent: true, sourceId: sessionSourceIdRef.current }
    );
  }, [
    options.context,
    options.enabled,
    options.quadrant,
    options.targetId,
    options.targetType,
    recordPersonalizationFeedback,
    sessionKey,
  ]);

  const recordAction = useCallback(async (
    eventType: MailPersonalizationFeedbackInput["eventType"],
    input?: Partial<MailPersonalizationFeedbackInput>
  ) => {
    if (!options.enabled || !options.targetId) {
      return null;
    }

    return recordPersonalizationFeedback(
      [
        {
          targetType: input?.targetType ?? options.targetType,
          targetId: input?.targetId ?? options.targetId,
          eventType,
          quadrant: input?.quadrant ?? options.quadrant,
          context: {
            ...(options.context ?? {}),
            ...(input?.context ?? {}),
          },
          ...(typeof input?.dwellMs === "number" ? { dwellMs: input.dwellMs } : {}),
        },
      ],
      { silent: true, sourceId: sessionSourceIdRef.current ?? activeSourceId }
    );
  }, [
    activeSourceId,
    options.context,
    options.enabled,
    options.quadrant,
    options.targetId,
    options.targetType,
    recordPersonalizationFeedback,
  ]);

  useEffect(() => {
    if (!options.enabled || !options.targetId) {
      return;
    }

    flushedKeyRef.current = null;
    accumulatedRef.current = 0;
    sessionSourceIdRef.current = activeSourceId ?? null;
    activeSinceRef.current = document.visibilityState === "visible" ? Date.now() : null;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        activeSinceRef.current = Date.now();
        return;
      }

      if (activeSinceRef.current) {
        accumulatedRef.current += Date.now() - activeSinceRef.current;
        activeSinceRef.current = null;
      }
    };

    const handlePageHide = () => {
      void flush();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      void flush();
    };
  }, [activeSourceId, flush, options.enabled, options.targetId]);

  return {
    recordAction,
  };
}
