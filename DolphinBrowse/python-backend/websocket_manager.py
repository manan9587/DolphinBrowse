from typing import Dict, Set
from fastapi import WebSocket


class WebSocketManager:
    """Manage WebSocket connections per automation session."""

    def __init__(self) -> None:
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        connections = self.active_connections.get(session_id)
        if connections:
            connections.discard(websocket)
            if not connections:
                self.active_connections.pop(session_id, None)

    async def send_activity(self, session_id: str, message: str, status: str) -> None:
        await self.broadcast(session_id, {
            "type": "activity",
            "data": {"sessionId": session_id, "message": message, "status": status}
        })

    async def send_viewport(self, session_id: str, current_url: str) -> None:
        await self.broadcast(session_id, {
            "type": "status",
            "data": {"currentUrl": current_url}
        })

    async def broadcast(self, session_id: str, message: dict) -> None:
        connections = self.active_connections.get(session_id, set())
        to_remove = set()
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                to_remove.add(ws)
        for ws in to_remove:
            self.disconnect(session_id, ws)
