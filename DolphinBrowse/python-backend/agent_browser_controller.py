# agent_browser_controller.py
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional

# -- Optional backends ---------------------------------------------------------
HAVE_BA = False
try:
    # Your higher-level wrapper
    from browser_automation import BrowserAutomation  # type: ignore
    HAVE_BA = True
except Exception:
    pass

HAVE_BU = False
try:
    # Low-level fallback
    from browser_use import Agent  # type: ignore
    from browser_use.llm import ChatOpenAI  # type: ignore
    HAVE_BU = True
except Exception:
    pass


# -- Callback type hints -------------------------------------------------------
ActivityCb = Callable[[str, str, str], Awaitable[None]]  # (session_id, message, level)
ViewportCb = Callable[[str, str], Awaitable[None]]       # (session_id, url)


class AgentBrowserController:
    """
    High-level orchestration for a browser automation session.

    Backends:
      1) BrowserAutomation (preferred if importable)
      2) browser_use.Agent fallback

    Callbacks:
      - activity_cb(session_id, message, level)
      - viewport_cb(session_id, url)
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
        self.session_id = session_id
        self.task_description = task_description
        self.model = model

        # Callbacks (WebSocketManager takes precedence if provided)
        self._ws = websocket_manager
        self._activity_cb = activity_cb
        self._viewport_cb = viewport_cb

        # Backend state
        self._backend: str = "auto"
        self._automation: Optional[BrowserAutomation] = None  # for BrowserAutomation path
        self._agent: Optional[Agent] = None                   # for browser_use path
        self._task: Optional[asyncio.Task] = None             # used by browser_use path

        # Decide backend now
        if HAVE_BA:
            self._backend = "browser_automation"
            # Wire callbacks
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
                session_id=session_id,
                task_description=task_description,
                model=model,
                activity_callback=activity,
                viewport_callback=viewport,
            )
        elif HAVE_BU:
            self._backend = "browser_use"
            # Construct lazily in start()
        else:
            raise RuntimeError(
                "No automation backend available. Install either "
                "`browser_automation` or `browser_use`."
            )

    # -- Callback bridges ------------------------------------------------------
    async def _activity_bridge(self, message: str, level: str = "info") -> None:
        # Normalize to (session_id, message, level)
        if self._activity_cb:
            await self._activity_cb(self.session_id, message, level)

    async def _viewport_bridge(self, url: str) -> None:
        # Normalize to (session_id, url)
        if self._viewport_cb:
            await self._viewport_cb(self.session_id, url)

    # -- Public API ------------------------------------------------------------
    async def start(self, max_seconds: Optional[int] = None) -> None:
        """
        Start the automation and wait until it finishes or times out.
        """
        if self._backend == "browser_automation":
            await self._start_browser_automation(max_seconds)
        else:
            await self._start_browser_use(max_seconds)

    async def pause(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.pause()
            await self._activity_bridge("paused", "warning")
        elif self._backend == "browser_use":
            # No built-in pause in browser_use; emulate by cancelling the task.
            if self._task and not self._task.done():
                self._task.cancel()
            await self._activity_bridge("paused", "warning")

    async def resume(self, max_seconds: Optional[int] = None) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.resume()
            await self._activity_bridge("resumed", "info")
        elif self._backend == "browser_use":
            # Re-run the agent
            await self.start(max_seconds=max_seconds)

    async def stop(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.stop()
            await self._automation.cleanup()
        elif self._backend == "browser_use":
            if self._task and not self._task.done():
                self._task.cancel()
        await self._activity_bridge("stopped", "info")

    async def cleanup(self) -> None:
        if self._backend == "browser_automation" and self._automation:
            await self._automation.cleanup()

    # -- Backend implementations ----------------------------------------------
    async def _start_browser_automation(self, max_seconds: Optional[int]) -> None:
        assert self._automation is not None
        await self._automation.start_browser()

        async def _run():
            await self._automation.execute_task()

        try:
            if max_seconds is not None:
                await asyncio.wait_for(_run(), timeout=max_seconds)
            else:
                await _run()
            await self._activity_bridge("completed", "success")
        except asyncio.TimeoutError:
            await self._activity_bridge("time limit reached", "warning")
            await self.stop()

    async def _start_browser_use(self, max_seconds: Optional[int]) -> None:
        # Lazily create Agent with callbacks
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
            if max_seconds is not None:
                await asyncio.wait_for(self._task, timeout=max_seconds)
            else:
                await self._task
            await self._activity_bridge("completed", "success")
        except asyncio.TimeoutError:
            await self._activity_bridge("time limit reached", "warning")
            await self.stop()
