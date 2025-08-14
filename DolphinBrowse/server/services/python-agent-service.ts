// services/python-agent-service.ts

const BASE_URL =
  process.env.PY_BACKEND ||
  process.env.PYTHON_SERVICE_URL ||
  "http://localhost:8001";

// Fallback to node-fetch on older Node runtimes
async function postJSON(path: string, body: unknown): Promise<any> {
  const f: typeof fetch =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch ?? (await import("node-fetch")).default as any;

  const res = await f(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Python service error: ${res.status} ${res.statusText} ${text}`
    );
  }

  // Some endpoints might return empty body
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type SessionStatus = "paused" | "running" | "completed";

export interface AutomationStartPayload {
  sessionId: string;
  taskDescription: string;
  model?: string;
  maxSeconds?: number;
}

/** Preferred API (Python: /start-session) */
export async function startAutomation(payload: AutomationStartPayload) {
  return postJSON("/start-session", payload);
}

/** Preferred API (Python: /update-session) */
export async function updateAutomationStatus(
  sessionId: string,
  status: SessionStatus
) {
  return postJSON("/update-session", { sessionId, status });
}

/* ── Legacy helpers kept for back-compat; delegate to the new API ─────────── */

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

export async function resumeAgent(sessionId: string, _maxSeconds?: number) {
  // If needed, extend remaining budget on the Python side inside /update-session.
  return updateAutomationStatus(sessionId, "running");
}

export async function stopAgent(sessionId: string) {
  return updateAutomationStatus(sessionId, "completed");
}
