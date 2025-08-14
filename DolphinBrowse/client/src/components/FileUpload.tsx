import { useState, DragEvent, useRef } from 'react';

export function FileUpload() {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!e.dataTransfer.files.length) return;
    await handleFile(e.dataTransfer.files[0]);
  };

  const handleFile = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
    const { fileId } = await uploadRes.json();
    const pyUrl = `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_PY_PORT}/api/files/${fileId}/analyze`;
    const res = await fetch(pyUrl, { method: 'POST' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remarks.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`border-dashed border-2 p-4 text-center rounded ${dragging ? 'bg-gray-100' : ''}`}
      onClick={() => inputRef.current?.click()}
    >
      <p>Drag and drop a file here, or click to select</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => e.target.files && handleFile(e.target.files[0])}
      />
    </div>
  );
}
