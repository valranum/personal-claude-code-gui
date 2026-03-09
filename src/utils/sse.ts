import { getAuthTokenSync } from "./api";

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

export function connectSSE(
  url: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const token = getAuthTokenSync();
  const separator = url.includes("?") ? "&" : "?";
  const authedUrl = token ? `${url}${separator}token=${token}` : url;

  const es = new EventSource(authedUrl);

  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent;
      onEvent(event);
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = (e) => {
    onError?.(e);
  };

  return es;
}
