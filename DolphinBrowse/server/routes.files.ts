import { Router } from 'express';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';

const upload = multer({ dest: '/tmp/uploads' });
export const files = Router();

files.post('/api/upload', upload.single('file'), async (req, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'NO_FILE' });
  const detected = await fileTypeFromFile(file.path);
  const ext = detected?.ext?.toLowerCase() || '';
  const allowed = ['pdf', 'docx', 'xlsx', 'csv'];
  if (!allowed.includes(ext)) {
    return res.status(400).json({ error: 'UNSUPPORTED_FILE' });
  }
  res.json({ fileId: file.filename, originalName: file.originalname, mimetype: file.mimetype });
});
