import { WebSocket } from 'ws';

const sessionConnections = new Map<string, Set<WebSocket>>();

export function subscribe(sessionId: string, ws: WebSocket) {
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set());
  }
  sessionConnections.get(sessionId)!.add(ws);
}

export function unsubscribe(ws: WebSocket) {
  for (const [id, connections] of Array.from(sessionConnections.entries())) {
    connections.delete(ws);
    if (connections.size === 0) {
      sessionConnections.delete(id);
    }
  }
}

export function broadcast(sessionId: string, message: any) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    const msg = JSON.stringify(message);
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });
  }
}
