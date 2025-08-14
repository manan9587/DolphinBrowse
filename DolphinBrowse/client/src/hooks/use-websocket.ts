import { useEffect, useRef, useState } from 'react';

export interface WsMessage {
  type: string;
  data: any;
}

export function useWebsocket(sessionId?: string) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const port = import.meta.env.VITE_PY_PORT || '8001';

  useEffect(() => {
    if (!sessionId) return;
    const ws = new WebSocket(`ws://${window.location.hostname}:${port}/ws/${sessionId}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        setMessages((m) => [...m, msg]);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [sessionId, port]);

  return { messages, connected };
}