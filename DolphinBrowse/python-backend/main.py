# server.py
from __future__ import annotations

import asyncio
import subprocess
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from websocket_manager import WebSocketManager
from agent_browser_controller import AgentBrowserController

# ---------------------- App & State ----------------------
app = FastAPI(title="AgentBrowse Automation Backend", version="1.0.0")
ws_manager = WebSocketManager()
active_sessions: Dict[str, AgentBrowserController] = {}

# ---------------------- Models --------------------------
class StartPayload(BaseModel):
    sessionId: str
    task: str
    model: Optional[str] = None
    maxSeconds: Optional[int] = None  # total run time cap

class SessionIdPayload(BaseModel):
    sessionId: str
    maxSeconds: Optional[int] = None  # used for resume()

# ---------------------- Startup -------------------------
@app.on_event("startup")
async def setup() -> None:
    # Best-effort ensure Chromium is present (no-op if already installed)
    try:
        subprocess.run(
            ["python", "-m", "playwright", "install", "chromium"],
            check=False,
            capture_output=True,
        )
    except Exception:
        pass

# ---------------------- Health --------------------------
@app.get("/health")
async def health():
    return {"ok": True, "sessions": len(active_sessions)}

# ---------------------- WebSocket -----------------------
@app.websocket("/ws/{session_id}")
async def ws_endpoint(websocket: WebSocket, session_id: str):
    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            # Keep the socket open; messages from client are ignored
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)

# ---------------------- Helpers -------------------------
async def _run_session(controller: AgentBrowserController, session_id: str, max_seconds: int) -> None:
    try:
        await controller.start(max_seconds=max_seconds)
    finally:
        # Always cleanup and remove from registry
        try:
            await controller.cleanup()
        finally:
            active_sessions.pop(session_id, None)

# ---------------------- REST: control -------------------
@app.post("/start-session")
async def start_session(payload: StartPayload):
    if payload.sessionId in active_sessions:
        raise HTTPException(status_code=400, detail="ALREADY_RUNNING")

    controller = AgentBrowserController(
        session_id=payload.sessionId,
        task_description=payload.task,
        model=payload.model or "gpt-4o-mini",
        websocket_manager=ws_manager,    # routes activity/viewport to sockets
    )
    active_sessions[payload.sessionId] = controller

    # Fire and forget; controller removes itself on completion
    asyncio.create_task(
        _run_session(controller, payload.sessionId, payload.maxSeconds or 120)
    )
    return {"ok": True, "sessionId": payload.sessionId}

@app.post("/stop-session")
async def stop_session(payload: SessionIdPayload):
    controller = active_sessions.get(payload.sessionId)
    if controller:
        await controller.stop()
        await controller.cleanup()
        active_sessions.pop(payload.sessionId, None)
    return {"ok": True}

@app.post("/pause-session")
async def pause_session(payload: SessionIdPayload):
    controller = active_sessions.get(payload.sessionId)
    if controller:
        await controller.pause()
        return {"ok": True}
    raise HTTPException(status_code=404, detail="NOT_FOUND")

@app.post("/resume-session")
async def resume_session(payload: SessionIdPayload):
    controller = active_sessions.get(payload.sessionId)
    if not controller:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    await controller.resume(max_seconds=payload.maxSeconds or 120)
    return {"ok": True}

@app.get("/status/{session_id}")
async def status(session_id: str):
    return {"running": session_id in active_sessions}
