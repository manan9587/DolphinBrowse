import { useEffect, useMemo, useRef, useState } from "react";

export interface WsMessage {
  type: string;
  data: any;
  // optional server-side fields are tolerated
  [k: string]: any;
}

type Mode = "python" | "node";

export interface UseWebsocketOptions {
  /** Force backend mode. If omitted, inferred from env VITE_WS_MODE (python|node). */
  mode?: Mode;
  /** Override full ws URL (e.g. wss://api.example.com/ws/123). If provided, mode detection is skipped. */
  url?: string;
  /** Python ws port (defaults to VITE_PY_PORT or 8001). */
  pyPort?: string | number;
  /** Node ws port (defaults to VITE_NODE_PORT or window.location.port). */
  nodePort?: string | number;
  /** Auto reconnect (default true). */
  reconnect?: boolean;
  /** Max reconnect attempts (default 10). */
  maxRetries?: number;
  /** Heartbeat interval ms (default 25000). Set 0/false to disable. */
  heartbeatMs?: number;
  /** Optional logger */
  debug?: boolean;
}

export function useWebsocket(sessionId?: string, opts: UseWebsocketOptions = {}) {
  const {
    mode = (import.meta.env.VITE_WS_MODE as Mode) || "python",
    url,
    pyPort = import.meta.env.VITE_PY_PORT || "8001",
    nodePort = import.meta.env.VITE_NODE_PORT || window.location.port,
    reconnect = true,
    maxRetries = 10,
    heartbeatMs = 25_000,
    debug = false,
  } = opts;

  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const hbRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const manualCloseRef = useRef(false);

  const wsUrl = useMemo(() => {
    if (url) return url; // full override
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;

    if (mode === "python") {
      // Python FastAPI expects /ws/{sessionId}
      if (!sessionId) return null;
      return `${proto}//${host}:${String(pyPort)}/ws/${sessionId}`;
    } else {
      // Node WS hub expects /ws and a subscribe message
      return `${proto}//${host}:${String(nodePort)}/ws`;
    }
  }, [url, mode, nodePort, pyPort, sessionId]);

  const clearMessages = () => setMessages([]);
  const disconnect = () => {
    manualCloseRef.current = true;
    if (hbRef.current) {
      window.clearInterval(hbRef.current);
      hbRef.current = null;
    }
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setReconnecting(false);
  };

  const send = (payload: any) => {
    const s = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(s);
      return true;
    }
    return false;
  };

  // core connect routine
  useEffect(() => {
    if (!sessionId) return;
    if (!wsUrl) return;

    manualCloseRef.current = false;
    setError(null);

    const connect = () => {
      try {
        if (debug) console.log("[WS] connecting", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (debug) console.log("[WS] open");
          setConnected(true);
          setReconnecting(false);
          setRetryCount(0);

          // Node hub requires subscribe frame.
          if (mode === "node") {
            try {
              ws.send(JSON.stringify({ type: "subscribe", sessionId }));
            } catch {}
          }

          // heartbeat (client -> server ping)
          if (heartbeatMs && !hbRef.current) {
            hbRef.current = window.setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "ping", t: Date.now() }));
              }
            }, heartbeatMs) as unknown as number;
          }
        };

        ws.onmessage = (ev) => {
          try {
            const msg: WsMessage = JSON.parse(ev.data);
            setLastMessage(msg);
            setMessages((prev) => [...prev, msg]);
          } catch {
            // accept text frames too
            const msg: WsMessage = { type: "text", data: ev.data };
            setLastMessage(msg);
            setMessages((prev) => [...prev, msg]);
          }
        };

        ws.onerror = (e) => {
          if (debug) console.warn("[WS] error", e);
          setError("WebSocket error");
        };

        ws.onclose = () => {
          if (debug) console.log("[WS] close");
          setConnected(false);
          // clear heartbeat
          if (hbRef.current) {
            window.clearInterval(hbRef.current);
            hbRef.current = null;
          }

          if (manualCloseRef.current || !reconnect) return;

          // backoff reconnect
          const nextRetry = Math.min(retryCount + 1, maxRetries);
          if (nextRetry > maxRetries) return;

          setRetryCount(nextRetry);
          setReconnecting(true);

          // exp backoff: 0.5s, 1s, 2s, 4s, ... (max 10s)
          const delay = Math.min(10_000, 500 * Math.pow(2, nextRetry - 1));
          if (debug) console.log(`[WS] reconnecting in ${delay}ms (attempt ${nextRetry}/${maxRetries})`);

          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            connect();
          }, delay) as unknown as number;
        };
      } catch (err: any) {
        setError(err?.message || "WebSocket init failed");
      }
    };

    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, sessionId, mode, reconnect, maxRetries, heartbeatMs, debug]);

  return {
    messages,
    lastMessage,
    connected,
    reconnecting,
    retryCount,
    error,
    send,
    clearMessages,
    disconnect,
  };
}
