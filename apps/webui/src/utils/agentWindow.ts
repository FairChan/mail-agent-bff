const AGENT_WINDOW_PARAM = "window";
const AGENT_WINDOW_VALUE = "agent";
const AGENT_SOURCE_PARAM = "sourceId";

function currentUrl(): URL {
  return new URL(window.location.href);
}

export function buildAgentWindowUrl(sourceId?: string | null): string {
  const url = currentUrl();
  url.searchParams.set(AGENT_WINDOW_PARAM, AGENT_WINDOW_VALUE);
  if (sourceId) {
    url.searchParams.set(AGENT_SOURCE_PARAM, sourceId);
  } else {
    url.searchParams.delete(AGENT_SOURCE_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildDashboardUrl(): string {
  const url = currentUrl();
  url.searchParams.delete(AGENT_WINDOW_PARAM);
  url.searchParams.delete(AGENT_SOURCE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getRequestedAgentSourceId(): string | null {
  const value = currentUrl().searchParams.get(AGENT_SOURCE_PARAM);
  return value?.trim() ? value : null;
}

export function isAgentWindowLocation(locationLike: Pick<Location, "search"> = window.location): boolean {
  return new URLSearchParams(locationLike.search).get(AGENT_WINDOW_PARAM) === AGENT_WINDOW_VALUE;
}

export function updateAgentWindowSource(sourceId?: string | null): void {
  const url = currentUrl();
  if (sourceId) {
    url.searchParams.set(AGENT_SOURCE_PARAM, sourceId);
  } else {
    url.searchParams.delete(AGENT_SOURCE_PARAM);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function openAgentWindow(sourceId?: string | null): void {
  const url = buildAgentWindowUrl(sourceId);
  const popup = window.open(
    url,
    "mery-mail-agent-window",
    "popup=yes,width=1440,height=960,resizable=yes,scrollbars=yes"
  );

  if (!popup) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  popup.focus();
}
