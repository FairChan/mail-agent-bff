function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTextMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const normalized = payload.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const candidates = [payload.error, payload.message, payload.detail, payload.code];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

export async function readApiPayload(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

export function getApiErrorMessage(
  payload: unknown,
  response: Response,
  fallback = "Request failed"
): string {
  const payloadMessage = readTextMessage(payload);
  if (payloadMessage) {
    return payloadMessage;
  }

  if (response.status >= 500) {
    return "Server temporarily unavailable. Please try again.";
  }

  return fallback;
}

export function getApiErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const candidates = [payload.errorCode, payload.code];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return undefined;
}
