import asyncio
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from websocket_manager import WebSocketManager
from agent_browser_controller import AgentBrowserController
import subprocess

app = FastAPI()
ws_manager = WebSocketManager()
active_sessions: Dict[str, AgentBrowserController] = {}

class StartPayload(BaseModel):
  sessionId: str
  task: str
  model: str | None = None
  maxSeconds: int | None = None

class SessionIdPayload(BaseModel):
  sessionId: str
  maxSeconds: int | None = None

@app.on_event("startup")
async def setup() -> None:
  try:
    subprocess.run(["python", "-m", "playwright", "install", "chromium"], check=False)
  except Exception:
    pass

@app.get("/health")
async def health():
  return {"ok": True, "sessions": len(active_sessions)}

@app.websocket("/ws/{session_id}")
async def ws_endpoint(websocket: WebSocket, session_id: str):
  await ws_manager.connect(session_id, websocket)
  try:
    while True:
      await websocket.receive_text()
  except WebSocketDisconnect:
    ws_manager.disconnect(session_id, websocket)

@app.post("/start-session")
async def start_session(payload: StartPayload):
  if payload.sessionId in active_sessions:
    raise HTTPException(status_code=400, detail="ALREADY_RUNNING")
  controller = AgentBrowserController(payload.sessionId, payload.task, payload.model or "gpt-4o-mini")
  active_sessions[payload.sessionId] = controller
  asyncio.create_task(controller.start(ws_manager.send_activity, ws_manager.send_viewport, payload.maxSeconds or 60))
  return {"ok": True}

@app.post("/stop-session")
async def stop_session(payload: SessionIdPayload):
  controller = active_sessions.pop(payload.sessionId, None)
  if controller:
    await controller.stop(ws_manager.send_activity)
  return {"ok": True}

@app.post("/pause-session")
async def pause_session(payload: SessionIdPayload):
  controller = active_sessions.get(payload.sessionId)
  if controller:
    await controller.pause(ws_manager.send_activity)
  return {"ok": True}

@app.post("/resume-session")
async def resume_session(payload: SessionIdPayload):
  controller = active_sessions.get(payload.sessionId)
  if not controller:
    raise HTTPException(status_code=404, detail="NOT_FOUND")
  await controller.resume(ws_manager.send_activity, ws_manager.send_viewport, payload.maxSeconds or 60)
  return {"ok": True}

@app.get("/status/{session_id}")
async def status(session_id: str):
  return {"running": session_id in active_sessions}
