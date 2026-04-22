import { useEffect, useMemo, useRef, useState } from "react";
import type { MailQuadrant } from "@mail-agent/shared-types";
import { quadrantLabel, quadrantOptions, quadrantShortLabel, quadrantTone } from "./quadrants";

type QuadrantOverrideControlProps = {
  locale: "zh" | "en" | "ja";
  value: MailQuadrant;
  manualValue: MailQuadrant | null;
  saving?: boolean;
  onChange: (quadrant: MailQuadrant | null) => Promise<void> | void;
};

export function QuadrantOverrideControl({
  locale,
  value,
  manualValue,
  saving = false,
  onChange,
}: QuadrantOverrideControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const options = useMemo(() => quadrantOptions(locale), [locale]);
  const activeTone = quadrantTone(value);
  const statusLabel =
    locale === "zh"
      ? manualValue
        ? "手动"
        : "自动"
      : locale === "ja"
        ? manualValue
          ? "手動"
          : "自動"
        : manualValue
          ? "Manual"
          : "Auto";
  const resetLabel =
    locale === "zh" ? "恢复自动判断" : locale === "ja" ? "自動判定に戻す" : "Reset to automatic";

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-semibold shadow-[var(--shadow-soft)] transition ${activeTone}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--ink)] dark:bg-white/10 dark:text-white">
          {statusLabel}
        </span>
        <span>{quadrantShortLabel(locale, value)}</span>
        <svg className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="m5.75 7.5 4.25 4.5 4.25-4.5" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-64 rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-base)] p-2 shadow-[var(--shadow-soft)] backdrop-blur"
          role="menu"
        >
          <div className="space-y-1">
            {options.map((option) => {
              const active = manualValue === option.quadrant;
              return (
                <button
                  key={option.quadrant}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={saving}
                  onClick={async () => {
                    await onChange(option.quadrant);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-[0.9rem] border px-3 py-2 text-sm transition ${
                    active
                      ? `${option.tone} shadow-[var(--shadow-soft)]`
                      : "border-transparent bg-[color:var(--surface-soft)] text-[color:var(--ink)] hover:border-[color:var(--border-soft)]"
                  }`}
                >
                  <span>{option.label}</span>
                  {active ? (
                    <span className="text-[11px] font-semibold">
                      {locale === "zh" ? "当前手动值" : locale === "ja" ? "手動値" : "Manual"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={saving || manualValue === null}
            onClick={async () => {
              await onChange(null);
              setOpen(false);
            }}
            className="mt-2 flex w-full items-center justify-center rounded-[0.9rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetLabel}
          </button>

          <p className="mt-2 px-1 text-[11px] leading-5 text-[color:var(--ink-subtle)]">
            {locale === "zh"
              ? `当前生效象限：${quadrantLabel(locale, value)}`
              : locale === "ja"
                ? `現在の有効象限: ${quadrantLabel(locale, value)}`
                : `Current effective quadrant: ${quadrantLabel(locale, value)}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
