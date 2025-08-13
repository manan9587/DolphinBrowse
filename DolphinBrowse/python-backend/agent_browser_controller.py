from __future__ import annotations

from typing import Optional

from browser_automation import BrowserAutomation
from websocket_manager import WebSocketManager


class AgentBrowserController:
    """High level orchestration for a browser-use automation session."""

    def __init__(
        self,
        session_id: str,
        task_description: str,
        model: str,
        websocket_manager: WebSocketManager,
    ) -> None:
        self.session_id = session_id
        self.websocket_manager = websocket_manager
        self.automation = BrowserAutomation(
            session_id=session_id,
            task_description=task_description,
            model=model,
            activity_callback=websocket_manager.send_activity,
            viewport_callback=websocket_manager.send_viewport,
        )

    async def start(self) -> None:
        await self.automation.start_browser()
        await self.automation.execute_task()

    async def update_status(self, status: str) -> None:
        if status == "paused":
            await self.automation.pause()
        elif status == "running":
            await self.automation.resume()
        elif status == "completed":
            await self.automation.stop()
            await self.automation.cleanup()

    async def cleanup(self) -> None:
        await self.automation.cleanup()
