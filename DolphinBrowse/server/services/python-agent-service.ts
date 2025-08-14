const PYTHON_BASE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';

export interface AutomationStartPayload {
  sessionId: string;
  taskDescription: string;
  model: string;
}

export async function startAutomation(payload: AutomationStartPayload) {
  const res = await fetch(`${PYTHON_BASE_URL}/start-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Python service error: ${res.status}`);
  }
  return res.json();
}

export async function updateAutomationStatus(sessionId: string, status: 'paused' | 'running' | 'completed') {
  const res = await fetch(`${PYTHON_BASE_URL}/update-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, status }),
  });
  if (!res.ok) {
    throw new Error(`Python service error: ${res.status}`);
  }
  return res.json();
}
