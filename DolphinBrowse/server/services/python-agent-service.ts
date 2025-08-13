const PY_BACKEND = process.env.PY_BACKEND || 'http://localhost:8001';

async function post(path: string, body: any) {
  const res = await fetch(`${PY_BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`Python service error: ${res.status}`);
  return res.json();
}

export async function startAgent(sessionId: string, task: string, model?: string, maxSeconds?: number) {
  return post('/start-session', { sessionId, taskDescription: task, model, maxSeconds });
}

export async function stopAgent(sessionId: string) {
  return post('/stop-session', { sessionId });
}

export async function pauseAgent(sessionId: string) {
  return post('/pause-session', { sessionId });
}

export async function resumeAgent(sessionId: string, maxSeconds?: number) {
  return post('/resume-session', { sessionId, maxSeconds });
}
