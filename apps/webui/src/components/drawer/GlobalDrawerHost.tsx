import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { ArtifactContentDetailDrawer } from "./ArtifactContentDetailDrawer";
import { EventClusterDetailDrawer } from "./EventClusterDetailDrawer";
import { MailKnowledgeDetailDrawer } from "./MailKnowledgeDetailDrawer";
import { PersonProfileDetailDrawer } from "./PersonProfileDetailDrawer";
import { useDrawerStore, type DrawerStackItem } from "./drawerStore";

const DRAWER_ROOT_ID = "global-right-drawer-root";
const BASE_Z_INDEX = 90;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ensureDrawerRoot() {
  let node = document.getElementById(DRAWER_ROOT_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = DRAWER_ROOT_ID;
    document.body.appendChild(node);
  }
  return node;
}

function renderDrawerContent(item: DrawerStackItem) {
  switch (item.componentName) {
    case "mailKnowledgeDetail":
      return <MailKnowledgeDetailDrawer {...item.props} />;
    case "eventClusterDetail":
      return <EventClusterDetailDrawer {...item.props} />;
    case "personProfileDetail":
      return <PersonProfileDetailDrawer {...item.props} />;
    case "artifactContentDetail":
      return <ArtifactContentDetailDrawer {...item.props} />;
    default:
      return null;
  }
}

function getDrawerLabel(item: DrawerStackItem) {
  switch (item.componentName) {
    case "mailKnowledgeDetail":
      return `邮件知识详情：${item.props.mail.subject || item.props.mail.mailId}`;
    case "eventClusterDetail":
      return `事件详情：${item.props.event.name || item.props.event.eventId}`;
    case "personProfileDetail":
      return `人物详情：${item.props.person.name || item.props.person.personId}`;
    case "artifactContentDetail":
      return `知识库文档：${item.props.content?.label ?? item.props.artifact.label}`;
    default:
      return "右侧抽屉";
  }
}

export function GlobalDrawerHost() {
  const stack = useDrawerStore((state) => state.stack);
  const closeTopDrawer = useDrawerStore((state) => state.closeTopDrawer);
  const closeDrawerById = useDrawerStore((state) => state.closeDrawerById);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const panelRefs = useRef(new Map<string, HTMLElement>());
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const hasDrawers = stack.length > 0;
  const topOpenDrawer = [...stack].reverse().find((item) => item.phase === "open") ?? null;

  useEffect(() => {
    setPortalRoot(ensureDrawerRoot());
  }, []);

  useEffect(() => {
    if (!hasDrawers) {
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
        previouslyFocusedRef.current = null;
      }
      return;
    }

    if (!previouslyFocusedRef.current && document.activeElement instanceof HTMLElement) {
      previouslyFocusedRef.current = document.activeElement;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [hasDrawers]);

  useEffect(() => {
    if (!topOpenDrawer) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const topPanel = panelRefs.current.get(topOpenDrawer.id);
      if (!topPanel) {
        return;
      }
      const focusable = Array.from(topPanel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      );
      (focusable[0] ?? topPanel).focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [topOpenDrawer?.id]);

  useEffect(() => {
    if (!hasDrawers) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTopDrawer();
        return;
      }

      if (event.key !== "Tab" || !topOpenDrawer) {
        return;
      }

      const topPanel = panelRefs.current.get(topOpenDrawer.id);
      if (!topPanel) {
        return;
      }

      const focusable = Array.from(topPanel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      );

      if (focusable.length === 0) {
        event.preventDefault();
        topPanel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!topPanel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTopDrawer, hasDrawers, topOpenDrawer]);

  useEffect(() => {
    if (!topOpenDrawer) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const topPanel = panelRefs.current.get(topOpenDrawer.id);
      const target = event.target;
      if (!topPanel || !(target instanceof Node)) {
        return;
      }

      if (target instanceof Element && target.closest(".global-drawer-backdrop")) {
        return;
      }

      if (topPanel.contains(target)) {
        return;
      }

      closeTopDrawer();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [closeTopDrawer, topOpenDrawer]);

  if (!portalRoot || stack.length === 0) {
    return null;
  }

  return createPortal(
    <div className="global-drawer-stack" aria-live="polite">
      {stack.map((item, index) => {
        const stackDepth = Math.max(0, stack.length - 1 - index);
        const isTop = item.id === topOpenDrawer?.id;
        const zIndex = BASE_Z_INDEX + index * 20;
        const style = {
          zIndex,
          "--drawer-offset": `${stackDepth * -24}px`,
          "--drawer-scale": `${Math.max(0.92, 1 - stackDepth * 0.028)}`,
          "--drawer-blur": `${Math.min(stackDepth * 0.8, 2.4)}px`,
        } as React.CSSProperties;

        return (
          <div
            key={item.id}
            className={cn(
              "global-drawer-layer",
              isTop && "is-top",
              item.phase === "closing" && "is-closing"
            )}
            style={style}
          >
            <button
              type="button"
              className="global-drawer-backdrop"
              aria-label="关闭当前抽屉"
              tabIndex={isTop ? 0 : -1}
              onClick={isTop ? closeTopDrawer : undefined}
            />
            <section
              ref={(node) => {
                if (node) {
                  panelRefs.current.set(item.id, node);
                } else {
                  panelRefs.current.delete(item.id);
                }
              }}
              className="global-drawer-panel"
              role="dialog"
              aria-modal={isTop ? "true" : undefined}
              aria-hidden={isTop ? undefined : "true"}
              aria-label={getDrawerLabel(item)}
              tabIndex={-1}
            >
              <button
                type="button"
                className="global-drawer-close"
                onClick={() => closeDrawerById(item.id)}
                aria-label="关闭抽屉"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              {renderDrawerContent(item)}
            </section>
          </div>
        );
      })}
    </div>,
    portalRoot
  );
}
