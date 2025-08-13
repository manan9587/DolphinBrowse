import { useCallback, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
}

export function FileDropzone({ onFile }: Props) {
  const [highlight, setHighlight] = useState(false);

  const onFiles = useCallback((files: FileList | null) => {
    if (files && files[0]) onFile(files[0]);
  }, [onFile]);

  return (
    <div
      className={`border-dashed border-2 rounded p-4 text-center ${highlight ? 'bg-gray-100' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setHighlight(true); }}
      onDragLeave={() => setHighlight(false)}
      onDrop={(e) => { e.preventDefault(); setHighlight(false); onFiles(e.dataTransfer.files); }}
    >
      <p className="mb-2">Drag & drop file here or click to browse</p>
      <input type="file" onChange={(e) => onFiles(e.target.files)} className="hidden" id="file-input" />
      <label htmlFor="file-input" className="cursor-pointer text-blue-600 underline">Browse</label>
    </div>
  );
}
