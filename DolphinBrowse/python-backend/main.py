from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
import uvicorn
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Optional
import aiohttp
from pydantic import BaseModel

from browser_automation import BrowserAutomation

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AgentBrowse Automation Backend", version="1.0.0")

# Store active browser sessions
active_sessions: Dict[str, BrowserAutomation] = {}

class SessionRequest(BaseModel):
    sessionId: str
    taskDescription: str
    model: str = "gpt-4"

class SessionUpdate(BaseModel):
    sessionId: str
    status: str

class ActivityLog(BaseModel):
    sessionId: str
    message: str
    status: str = "info"

async def send_webhook(endpoint: str, data: dict):
    """Send webhook to Node.js backend"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://localhost:5000/api/webhook/{endpoint}",
                json=data,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status != 200:
                    logger.error(f"Webhook failed: {endpoint} - {response.status}")
    except Exception as e:
        logger.error(f"Webhook error: {endpoint} - {str(e)}")

async def log_activity(session_id: str, message: str, status: str = "info"):
    """Log activity and send to frontend via webhook"""
    logger.info(f"Session {session_id}: {message}")
    await send_webhook("activity", {
        "sessionId": session_id,
        "message": message,
        "status": status
    })

async def update_viewport(session_id: str, current_url: str):
    """Update viewport URL and notify frontend"""
    await send_webhook("viewport-update", {
        "sessionId": session_id,
        "currentUrl": current_url
    })

@app.post("/start-session")
async def start_session(request: SessionRequest, background_tasks: BackgroundTasks):
    """Start a new browser automation session"""
    try:
        session_id = request.sessionId
        
        if session_id in active_sessions:
            raise HTTPException(status_code=400, detail="Session already active")
        
        # Create new browser automation instance
        browser_automation = BrowserAutomation(
            session_id=session_id,
            task_description=request.taskDescription,
            model=request.model,
            activity_callback=log_activity,
            viewport_callback=update_viewport
        )
        
        active_sessions[session_id] = browser_automation
        
        # Start automation in background
        background_tasks.add_task(run_automation_session, session_id)
        
        await log_activity(session_id, "Browser automation session initialized", "success")
        
        return {"success": True, "sessionId": session_id}
        
    except Exception as e:
        logger.error(f"Failed to start session {request.sessionId}: {str(e)}")
        await log_activity(request.sessionId, f"Failed to start session: {str(e)}", "error")
        raise HTTPException(status_code=500, detail=str(e))

async def run_automation_session(session_id: str):
    """Run the browser automation session"""
    try:
        automation = active_sessions.get(session_id)
        if not automation:
            return
        
        await log_activity(session_id, "Starting browser instance", "info")
        await automation.start_browser()
        
        await log_activity(session_id, "Analyzing task requirements", "info")
        await automation.execute_task()
        
        await log_activity(session_id, "Automation completed successfully", "success")
        
    except Exception as e:
        logger.error(f"Automation session {session_id} failed: {str(e)}")
        await log_activity(session_id, f"Automation failed: {str(e)}", "error")
    finally:
        # Cleanup
        automation = active_sessions.get(session_id)
        if automation:
            await automation.cleanup()
            del active_sessions[session_id]

@app.post("/update-session")
async def update_session(request: SessionUpdate):
    """Update session status (pause/resume/stop)"""
    try:
        session_id = request.sessionId
        automation = active_sessions.get(session_id)
        
        if not automation:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if request.status == "paused":
            await automation.pause()
            await log_activity(session_id, "Session paused", "warning")
        elif request.status == "running":
            await automation.resume()
            await log_activity(session_id, "Session resumed", "info")
        elif request.status == "completed":
            await automation.stop()
            await log_activity(session_id, "Session stopped by user", "info")
            await automation.cleanup()
            del active_sessions[session_id]
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Failed to update session {request.sessionId}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/viewport/{session_id}")
async def get_viewport_stream(session_id: str):
    """Stream browser viewport for given session"""
    try:
        automation = active_sessions.get(session_id)
        if not automation:
            raise HTTPException(status_code=404, detail="Session not found")
        
        async def generate_viewport():
            try:
                async for frame in automation.get_viewport_stream():
                    yield frame
            except Exception as e:
                logger.error(f"Viewport stream error: {str(e)}")
                yield b"data: error\n\n"
        
        return StreamingResponse(
            generate_viewport(),
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
        
    except Exception as e:
        logger.error(f"Viewport error for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_sessions": len(active_sessions),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/sessions")
async def list_sessions():
    """List all active sessions"""
    sessions = []
    for session_id, automation in active_sessions.items():
        sessions.append({
            "sessionId": session_id,
            "status": automation.status,
            "taskDescription": automation.task_description,
            "startTime": automation.start_time,
            "currentUrl": automation.current_url
        })
    return {"sessions": sessions}

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down browser automation backend...")
    for session_id, automation in active_sessions.items():
        try:
            await automation.cleanup()
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {str(e)}")
    
    active_sessions.clear()
    logger.info("Shutdown complete")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
