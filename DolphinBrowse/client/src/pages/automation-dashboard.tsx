import { useEffect, useMemo, useState } from "react";
import { BrowserViewport } from "@/components/browser-viewport";
import { useWebsocket } from "@/hooks/use-websocket";

type ApiMode = "agent" | "automation";

export default function AutomationDashboard() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [task, setTask] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState("");

  // If you adopted the robust hook I shared earlier, it exposes lastMessage.
  // This still works if your hook only returns `messages`.
  const { messages, lastMessage, connected } = useWebsocket(sessionId, {
    // optional: pick "python" or "node" via VITE_WS_MODE in your env
    mode: (import.meta.env.VITE_WS_MODE as any) || "python",
  });

  // Switch between /api/agent/* and /api/automation/* without code changes
  const apiMode: ApiMode =
    (import.meta.env.VITE_AGENT_MODE as ApiMode) || "agent";

  // Append activity + update viewport from WS frames (supports both schemas)
  useEffect(() => {
    const msg = lastMessage ?? messages.at(-1);
    if (!msg) return;

    if (msg.type === "activity") {
      const m =
        msg.data?.message ??
        (typeof msg.message === "string" ? msg.message : "") ??
        "";
      if (m) setLogs((l) => [...l, m]);
    }
    if (msg.type === "viewport") {
      const u = msg.data?.currentUrl ?? msg.currentUrl ?? "";
      if (u) setCurrentUrl(u);
    }
  }, [lastMessage, messages]);

  // --- API helpers with graceful fallback between agent/automation routes ---
  const postJson = async (path: string, body: any) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return res;
  };

  const callWithFallback = async (
    primary: { path: string; body?: any },
    fallback?: { path: string; body?: any }
  ) => {
    const r = await postJson(primary.path, primary.body);
    if (r.ok) return r.json();

    if (fallback) {
      const r2 = await postJson(fallback.path, fallback.body ?? primary.body);
      if (r2.ok) return r2.json();
    }
    throw new Error(`API error: ${r.status}`);
  };

  const start = async () => {
    const model = import.meta.env.VITE_MODEL ?? "gpt-4o-mini";
    const asAgent = {
      path: "/api/agent/start",
      body: { sessionId, task, model, userKey: "dev" },
    };
    const asAuto = {
      path: "/api/automation/start",
      body: { sessionId, taskDescription: task, model },
    };

    if (apiMode === "agent") {
      await callWithFallback(asAgent, asAuto);
    } else {
      await callWithFallback(asAuto, asAgent);
    }
  };

  const stop = async () => {
    if (apiMode === "agent") {
      await callWithFallback(
        { path: "/api/agent/stop", body: { sessionId } },
        { path: `/api/automation/${sessionId}/stop`, body: {} }
      );
    } else {
      await callWithFallback(
        { path: `/api/automation/${sessionId}/stop`, body: {} },
        { path: "/api/agent/stop", body: { sessionId } }
      );
    }
  };

  // --- Minimal inline dropzone/uploader (replaces FileUpload/FileDropzone) ---
  const handleFile = async (file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/files/analyze", { method: "POST", body: form });
      if (!res.ok) {
        setLogs((l) => [...l, "File analyze failed."]);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "remarks.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setLogs((l) => [...l, "remarks.xlsx downloaded."]);
    } catch (e: any) {
      setLogs((l) => [...l, `File analyze error: ${e?.message || e}`]);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const statusBadge = useMemo(
    () => (
      <span
        className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs ${
          connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        {connected ? "connected" : "disconnected"}
      </span>
    ),
    [connected]
  );

  return (
    <div className="flex h-full gap-4">
      <div className="w-1/3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Session: <span className="font-mono">{sessionId}</span>
          </div>
          {statusBadge}
        </div>

        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          className="w-full border p-2 rounded"
          placeholder="Describe the task"
          rows={5}
        />

        <div className="flex gap-2">
          <button
            onClick={start}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            Start
          </button>
          <button
            onClick={stop}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Stop
          </button>
        </div>

        {/* Built-in file dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-6 text-sm text-gray-600"
        >
          <div>Drop a file here to analyze</div>
          <div>or</div>
          <label className="cursor-pointer rounded bg-gray-100 px-3 py-1 hover:bg-gray-200">
            Choose file
            <input type="file" className="hidden" onChange={onPick} />
          </label>
        </div>

        <div className="h-64 overflow-auto border p-2 rounded bg-white">
          {logs.map((l, i) => (
            <div key={i} className="text-xs leading-5">
              {l}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <BrowserViewport
          sessionId={sessionId}
          currentUrl={currentUrl}
          isConnected={connected}
        />
      </div>
    </div>
  );
}
