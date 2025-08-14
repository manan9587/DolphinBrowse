import { useEffect, useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { BrowserViewport } from '@/components/browser-viewport';
import { useWebsocket } from '@/hooks/use-websocket';

export default function AutomationDashboard() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [task, setTask] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const { messages, connected } = useWebsocket(sessionId);

  useEffect(() => {
    messages.forEach((m) => {
      if (m.type === 'activity') setLogs((l) => [...l, m.data.message]);
      if (m.type === 'viewport') setCurrentUrl(m.data.currentUrl);
    });
  }, [messages]);

  const start = async () => {
    await fetch('/api/agent/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, task }),
    });
  };

  const stop = async () => {
    await fetch('/api/agent/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  };

    return (
      <div className="flex h-full gap-4">
        <div className="w-1/3 space-y-4">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          className="w-full border p-2 rounded"
          placeholder="Describe the task"
        />
        <div className="flex gap-2">
          <button onClick={start} className="px-3 py-1 bg-green-500 text-white rounded">Start</button>
          <button onClick={stop} className="px-3 py-1 bg-red-500 text-white rounded">Stop</button>
        </div>
          <FileUpload />
        <div className="h-64 overflow-auto border p-2 rounded">
          {logs.map((l, i) => (
            <div key={i} className="text-sm">{l}</div>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <BrowserViewport sessionId={sessionId} currentUrl={currentUrl} isConnected={connected} />
      </div>
    </div>
  );
}
