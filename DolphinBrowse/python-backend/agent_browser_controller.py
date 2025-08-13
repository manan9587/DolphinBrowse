import asyncio
from typing import Callable, Optional
from browser_use import Agent
from browser_use.llm import ChatOpenAI

ActivityCb = Callable[[str, str, str], asyncio.Future]
ViewportCb = Callable[[str, str], asyncio.Future]

class AgentBrowserController:
    def __init__(self, session_id: str, task: str, model: str = "gpt-4o-mini"):
        self.session_id = session_id
        self.task = task
        self.model = model
        self._task: Optional[asyncio.Task] = None
        self._agent: Optional[Agent] = None

    async def start(self, activity_cb: ActivityCb, viewport_cb: ViewportCb, max_seconds: int) -> None:
        llm = ChatOpenAI(model=self.model)
        self._agent = Agent(task=self.task, llm=llm, use_vision=True,
                            activity_callback=lambda m, s="info": activity_cb(self.session_id, m, s),
                            viewport_callback=lambda url: viewport_cb(self.session_id, url))

        async def run_agent():
            await self._agent.run()
        self._task = asyncio.create_task(run_agent())
        try:
            await asyncio.wait_for(self._task, timeout=max_seconds)
            await activity_cb(self.session_id, "completed", "success")
        except asyncio.TimeoutError:
            await activity_cb(self.session_id, "time limit reached", "warning")
            await self.stop(activity_cb)

    async def pause(self, activity_cb: ActivityCb) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            await activity_cb(self.session_id, "paused", "warning")

    async def resume(self, activity_cb: ActivityCb, viewport_cb: ViewportCb, max_seconds: int) -> None:
        if self._agent:
            await self.start(activity_cb, viewport_cb, max_seconds)

    async def stop(self, activity_cb: ActivityCb) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
        await activity_cb(self.session_id, "stopped", "info")
