import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

export function FileUpload() {
  const [fileId, setFileId] = useState<string | null>(null);
  const onDrop = useCallback(async (files: File[]) => {
    const form = new FormData();
    form.append('file', files[0]);
    const { data } = await axios.post('/api/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setFileId(data.fileId);
  }, []);
  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleAnalyze = async () => {
    if (!fileId) return;
    const response = await axios.get(`/api/files/${fileId}/analyze`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'remarks.xlsx');
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="p-4">
      <div {...getRootProps()} className="border p-4 mb-4 cursor-pointer">
        <input {...getInputProps()} />
        <p>Drag & drop a file here, or click to select</p>
      </div>
      {fileId && (
        <button onClick={handleAnalyze} className="btn btn-primary">
          Analyze & Download Remarks
        </button>
      )}
    </div>
  );
}
