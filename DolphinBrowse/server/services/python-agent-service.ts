// services/python-agent-service.ts
const BASE_URL =
  process.env.PY_BACKEND ||
  process.env.PYTHON_SERVICE_URL ||
  "http://localhost:8001";

// Fallback to node-fetch on older Node
async function postJSON(path: string, body: unknown): Promise<any> {
  const f: typeof fetch =
    (globalThis as any).fetch ?? (await import("node-fetch")).default as any;
  const res = await f(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Python service error: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json().catch(() => ({}));
}

export type SessionStatus = "paused" | "running" | "completed";

export interface AutomationStartPayload {
  sessionId: string;
  taskDescription: string;
  model?: string;
  maxSeconds?: number;
}

/** New, preferred API */
export async function startAutomation(payload: AutomationStartPayload) {
  return postJSON("/start-session", payload);
}

export async function updateAutomationStatus(
  sessionId: string,
  status: SessionStatus
) {
  return postJSON("/update-session", { sessionId, status });
}

/** Legacy helpers kept for compatibility (delegate to the new API) */
export async function startAgent(
  sessionId: string,
  task: string,
  model?: string,
  maxSeconds?: number
) {
  return startAutomation({
    sessionId,
    taskDescription: task,
    model,
    maxSeconds,
  });
}

export async function pauseAgent(sessionId: string) {
  return updateAutomationStatus(sessionId, "paused");
}

export async function resumeAgent(sessionId: string, maxSeconds?: number) {
  // If you want to extend remaining budget in Python, add it to /update-session there.
  return updateAutomationStatus(sessionId, "running");
}

export async function stopAgent(sessionId: string) {
  return updateAutomationStatus(sessionId, "completed");
}
