import asyncio
import json
import base64
from datetime import datetime
from typing import Callable, Optional, AsyncGenerator
import aiohttp
from playwright.async_api import async_playwright, Browser, Page, BrowserContext
import logging

# Monkeypatch BaseSubprocessTransport.__del__ to silence "Event loop is closed"
# errors that can occur when Playwright shuts down while the loop is already
# closed.  This mirrors the behaviour in browser-use and helps keep shutdown
# logs clean.
from asyncio import base_subprocess

_original_del = base_subprocess.BaseSubprocessTransport.__del__


def _patched_del(self):
    """Skip cleanup that relies on a closed loop and ignore noisy errors."""
    try:
        if hasattr(self, "_loop") and self._loop and self._loop.is_closed():
            return
        _original_del(self)
    except RuntimeError as e:
        if "Event loop is closed" in str(e):
            pass
        else:
            raise


base_subprocess.BaseSubprocessTransport.__del__ = _patched_del

logger = logging.getLogger(__name__)

class BrowserAutomation:
    def __init__(
        self, 
        session_id: str, 
        task_description: str, 
        model: str = "gpt-4",
        activity_callback: Optional[Callable] = None,
        viewport_callback: Optional[Callable] = None
    ):
        self.session_id = session_id
        self.task_description = task_description
        self.model = model
        self.activity_callback = activity_callback
        self.viewport_callback = viewport_callback
        
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
        self.status = "initializing"
        self.start_time = datetime.utcnow().isoformat()
        self.current_url = "about:blank"
        self.is_paused = False
        
        # AI model configurations
        self.ai_configs = {
            "gpt-4": {
                "api_url": "https://api.openai.com/v1/chat/completions",
                "headers": {"Authorization": f"Bearer {self._get_env('OPENAI_API_KEY')}"}
            },
            "claude-3.5": {
                "api_url": "https://api.anthropic.com/v1/messages",
                "headers": {"x-api-key": self._get_env('ANTHROPIC_API_KEY')}
            },
            "gemini-pro": {
                "api_url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
                "headers": {"Authorization": f"Bearer {self._get_env('GOOGLE_API_KEY')}"}
            }
        }
    
    def _get_env(self, key: str) -> str:
        """Get environment variable with fallback"""
        import os
        return os.getenv(key, "")
    
    async def log_activity(self, message: str, status: str = "info"):
        """Log activity with callback"""
        if self.activity_callback:
            await self.activity_callback(self.session_id, message, status)
    
    async def update_viewport(self, url: str):
        """Update viewport URL"""
        self.current_url = url
        if self.viewport_callback:
            await self.viewport_callback(self.session_id, url)
    
    async def start_browser(self):
        """Initialize browser instance"""
        try:
            self.playwright = await async_playwright().start()
            
            # Launch browser with specific settings for automation
            self.browser = await self.playwright.chromium.launch(
                headless=False,  # Run in headful mode for viewport streaming
                args=[
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',  # Faster loading
                    '--window-size=1920,1080'
                ]
            )
            
            # Create browser context with realistic settings
            self.context = await self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            
            # Create new page
            self.page = await self.context.new_page()
            
            # Set up page event listeners
            self.page.on('framenavigated', self._on_navigation)
            self.page.on('console', self._on_console)
            self.page.on('pageerror', self._on_error)
            
            self.status = "ready"
            await self.log_activity("Browser initialized successfully", "success")
            
        except Exception as e:
            self.status = "failed"
            await self.log_activity(f"Failed to initialize browser: {str(e)}", "error")
            raise
    
    async def _on_navigation(self, frame):
        """Handle page navigation events"""
        if frame == self.page.main_frame:
            url = frame.url
            await self.update_viewport(url)
            await self.log_activity(f"Navigated to: {url}", "info")
    
    async def _on_console(self, msg):
        """Handle console messages"""
        if msg.type == 'error':
            await self.log_activity(f"Console error: {msg.text}", "warning")
    
    async def _on_error(self, error):
        """Handle page errors"""
        await self.log_activity(f"Page error: {str(error)}", "error")
    
    async def execute_task(self):
        """Execute the automation task using AI"""
        try:
            self.status = "running"
            await self.log_activity("Starting task execution", "info")
            
            # Parse task and create action plan
            action_plan = await self._generate_action_plan(self.task_description)
            
            # Execute each step in the plan
            for i, step in enumerate(action_plan, 1):
                if self.is_paused:
                    await self.log_activity("Task execution paused", "warning")
                    while self.is_paused:
                        await asyncio.sleep(1)
                    await self.log_activity("Task execution resumed", "info")
                
                await self.log_activity(f"Step {i}: {step['description']}", "info")
                await self._execute_step(step)
                
                # Small delay between steps
                await asyncio.sleep(2)
            
            self.status = "completed"
            await self.log_activity("Task completed successfully", "success")
            
        except Exception as e:
            self.status = "failed"
            await self.log_activity(f"Task execution failed: {str(e)}", "error")
            raise
    
    async def _generate_action_plan(self, task_description: str) -> list:
        """Generate action plan using AI"""
        try:
            # For this example, we'll create a simple plan based on the task
            # In production, you'd use the actual AI API
            
            if "palestine investment bank" in task_description.lower():
                return [
                    {"action": "navigate", "url": "https://www.google.com", "description": "Navigate to Google search"},
                    {"action": "search", "query": "Palestine Investment Bank official page", "description": "Search for Palestine Investment Bank"},
                    {"action": "click", "selector": "a[href*='pibbank.com']", "description": "Click on official bank website"},
                    {"action": "wait", "duration": 3, "description": "Wait for page to load"}
                ]
            else:
                # Generic web automation plan
                return [
                    {"action": "navigate", "url": "https://www.google.com", "description": "Navigate to Google"},
                    {"action": "search", "query": task_description, "description": f"Search for: {task_description}"},
                    {"action": "analyze", "description": "Analyze search results"}
                ]
                
        except Exception as e:
            await self.log_activity(f"Failed to generate action plan: {str(e)}", "error")
            raise
    
    async def _execute_step(self, step: dict):
        """Execute a single automation step"""
        try:
            action = step.get("action")
            
            if action == "navigate":
                url = step.get("url")
                await self.page.goto(url, wait_until="networkidle")
                await self.log_activity(f"Navigated to {url}", "success")
                
            elif action == "search":
                query = step.get("query")
                # Find search input and enter query
                search_input = await self.page.wait_for_selector("input[name='q'], input[type='search']", timeout=10000)
                await search_input.fill(query)
                await search_input.press("Enter")
                await self.page.wait_for_load_state("networkidle")
                await self.log_activity(f"Searched for: {query}", "success")
                
            elif action == "click":
                selector = step.get("selector")
                element = await self.page.wait_for_selector(selector, timeout=10000)
                await element.click()
                await self.page.wait_for_load_state("networkidle")
                await self.log_activity(f"Clicked element: {selector}", "success")
                
            elif action == "wait":
                duration = step.get("duration", 1)
                await asyncio.sleep(duration)
                await self.log_activity(f"Waited {duration} seconds", "info")
                
            elif action == "analyze":
                # Take screenshot and analyze page content
                await self._analyze_page()
                
        except Exception as e:
            await self.log_activity(f"Step execution failed: {str(e)}", "error")
            # Continue with next step instead of failing completely
    
    async def _analyze_page(self):
        """Analyze current page content"""
        try:
            # Get page title and URL
            title = await self.page.title()
            url = self.page.url
            
            # Take screenshot
            screenshot = await self.page.screenshot()
            
            # Get text content (simplified)
            content = await self.page.evaluate("() => document.body.innerText.slice(0, 1000)")
            
            await self.log_activity(f"Analyzed page: {title}", "info")
            await self.log_activity(f"Page content preview: {content[:100]}...", "info")
            
        except Exception as e:
            await self.log_activity(f"Page analysis failed: {str(e)}", "warning")
    
    async def pause(self):
        """Pause automation"""
        self.is_paused = True
        self.status = "paused"
    
    async def resume(self):
        """Resume automation"""
        self.is_paused = False
        self.status = "running"
    
    async def stop(self):
        """Stop automation"""
        self.status = "stopped"
        self.is_paused = False
    
    async def get_viewport_stream(self) -> AsyncGenerator[bytes, None]:
        """Stream browser viewport as HTML frames"""
        try:
            while self.page and not self.page.is_closed():
                if self.status == "stopped":
                    break
                
                # Get current page HTML
                try:
                    html_content = await self.page.content()
                    
                    # Create a simple iframe wrapper
                    iframe_html = f"""
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body {{ margin: 0; padding: 0; overflow: hidden; }}
                            iframe {{ width: 100%; height: 100vh; border: none; }}
                        </style>
                    </head>
                    <body>
                        <iframe srcdoc="{html_content.replace('"', '&quot;')}"></iframe>
                    </body>
                    </html>
                    """
                    
                    yield iframe_html.encode()
                    
                except Exception as e:
                    logger.error(f"Viewport capture error: {str(e)}")
                    # Return error page
                    error_html = f"""
                    <!DOCTYPE html>
                    <html>
                    <body style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial;">
                        <div style="text-align: center;">
                            <h2>Viewport Error</h2>
                            <p>Unable to capture browser viewport</p>
                            <small>{str(e)}</small>
                        </div>
                    </body>
                    </html>
                    """
                    yield error_html.encode()
                
                await asyncio.sleep(0.5)  # Update every 500ms
                
        except Exception as e:
            logger.error(f"Viewport stream error: {str(e)}")
    
    async def cleanup(self):
        """Clean up browser resources"""
        try:
            if self.page and not self.page.is_closed():
                await self.page.close()
            
            if self.context:
                await self.context.close()
            
            if self.browser:
                await self.browser.close()
            
            if self.playwright:
                await self.playwright.stop()
            
            await self.log_activity("Browser resources cleaned up", "info")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")
