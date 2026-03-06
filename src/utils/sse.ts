export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

export function connectSSE(
  url: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const es = new EventSource(url);

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
