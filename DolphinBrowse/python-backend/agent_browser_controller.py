# agent_browser_controller.py
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional

# Optional/high-level backend
HAVE_BA = False
try:
    from browser_automation import BrowserAutomation  # type: ignore
    HAVE_BA = True
except Exception:
    pass

# Fallback/low-level backend
HAVE_BU = False
try:
    from browser_use import Agent  # type: ignore
    from browser_use.llm import ChatOpenAI  # type: ignore
    HAVE_BU = True
except Exception:
    pass


ActivityCb = Callable[[str, str, str], Awaitable[None]]  # (session_id, message, level)
ViewportCb = Callable[[str, str],   Awaitable[None]]      # (session_id, url)


class AgentBrowserController:
    """
    High-level orchestration for a browser automation session.

    Backends:
      1) BrowserAutomation (preferred if importable)
      2) browser_use.Agent (fallback)

    Callbacks:
      - activity_cb(session_id, message, level)
      - viewport_cb(session_id, url)
      If a WebSocketManager is provided, its send_activity/send_viewport are used.
    """

    def __init__(
        self,
        session_id: str,
        task_description: str,
        model: str = "gpt-4o-mini",
        websocket_manager: Optional[object] = None,
        activity_cb: Optional[ActivityCb] = None,
        viewport_cb: Optional[ViewportCb] = None,
    ) -> None:
        if not (HAVE_BA or HAVE_BU):
            raise RuntimeError(
                "No automation backend available. Install either "
                "`browser_automation` or `browser-use`."
            )

        self.session_id = session_id
        self.task_description = task_description
        self.model = model

        # Prefer WebSocketManager callbacks if provided
        self._ws = websocket_manager
        self._activity_cb = activity_cb
        self._viewport_cb = viewport_cb

        # Backend state
        self._backend: str = "browser_automation" if HAVE_BA else "browser_use"
        self._automation: Optional[BrowserAutomation] = None  # BrowserAutomation path
        self._agent: Optional[Agent] = None                   # browser_use path
        self._task: Optional[asyncio.Task] = None             # browser_use task

        # Wire up the preferred backend
        if self._backend == "browser_automation":
            activity = (
                self._ws.send_activity  # type: ignore[attr-defined]
                if self._ws and hasattr(self._ws, "send_activity")
                else self._activity_bridge
            )
            viewport = (
                self._ws.send_viewport  # type: ignore[attr-defined]
                if self._ws and hasattr(self._ws, "send_viewport")
                else self._viewport_bridge
            )
            self._automation = BrowserAutomation(
                session_id=self.session_id,
                task_description=self.task_description,
                model=self.model,
                activity_callback=activity,
                viewport_callback=viewport,
            )

    # --------------------------------------------------------------------- #
    # Callback bridges (normalize signatures)
    # --------------------------------------------------------------------- #
    async def _activity_bridge(self, message: str, level: str = "info") -> None:
        if self._activity_cb:
            await self._activity_cb(self.session_id, message, level)

    async def _viewport_bridge(self, url: str) -> None:
        if self._viewport_cb:
            await self._viewport_cb(self.session_id, url)

    # --------------------------------------------------------------------- #
    # Public API
    # --------------------------------------------------------------------- #
    async def start(self, timeout: Optional[int] = None) -> None:
        """Start the automation and wait for completion or timeout."""
        if self._backend == "browser_automation":
            await self._start_browser_automation(timeout)
        else:
            await self._start_browser_use(timeout)

    async def update_status(self, status: str) -> None:
        """
        Uniform status control for external callers:
          - 'paused'    -> pause()
          - 'running'   -> resume()
          - 'completed' -> stop()
        """
        status_l = status.lower().strip()
        if status_l == "paused":
            await self.pause()
        elif status_l == "running":
            await self.resume()
        elif status_l == "completed":
            await self.stop()

    async def pause(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.pause()
            await self._activity_bridge("paused", "warning")
        else:
            # browser_use has no native pause; cancel current task
            if self._task and not self._task.done():
                self._task.cancel()
            await self._activity_bridge("paused", "warning")

    async def resume(self, timeout: Optional[int] = None) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.resume()
            await self._activity_bridge("resumed", "info")
        else:
            # Restart the agent in fallback mode
            await self.start(timeout=timeout)

    async def stop(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.stop()
            await self._automation.cleanup()
        else:
            if self._task and not self._task.done():
                self._task.cancel()
        await self._activity_bridge("stopped", "info")

    async def cleanup(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.cleanup()

    # --------------------------------------------------------------------- #
    # Backend implementations
    # --------------------------------------------------------------------- #
    async def _start_browser_automation(self, timeout: Optional[int]) -> None:
        assert self._automation is not None
        await self._automation.start_browser()

        async def _run():
            await self._automation.execute_task()

        try:
            if timeout is not None:
                await asyncio.wait_for(_run(), timeout=timeout)
            else:
                await _run()
            await self._activity_bridge("completed", "success")
        except asyncio.TimeoutError:
            await self._activity_bridge("time limit reached", "warning")
            await self.stop()

    async def _start_browser_use(self, timeout: Optional[int]) -> None:
        if self._agent is None:
            llm = ChatOpenAI(model=self.model)
            self._agent = Agent(
                task=self.task_description,
                llm=llm,
                use_vision=True,
                activity_callback=lambda m, s="info": self._activity_bridge(m, s),
                viewport_callback=lambda url: self._viewport_bridge(url),
            )

        async def _run():
            await self._agent.run()  # type: ignore[union-attr]

        self._task = asyncio.create_task(_run())
        try:
            if timeout is not None:
                await asyncio.wait_for(self._task, timeout=timeout)
            else:
                await self._task
            await self._activity_bridge("completed", "success")
        except asyncio.TimeoutError:
            await self._activity_bridge("time limit reached", "warning")
            await self.stop()
