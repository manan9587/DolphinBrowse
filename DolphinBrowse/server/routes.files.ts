import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
// These packages lack TypeScript declarations
// @ts-ignore
const pdfParse = require('pdf-parse');
// @ts-ignore
const mammoth = require('mammoth');
// @ts-ignore
const ExcelJS = require('exceljs');

const upload = multer({ dest: '/tmp/uploads' });
export const files = Router();

files.post('/api/files/analyze', upload.single('file'), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });
    const buffer = await fs.readFile(file.path);
    let text = '';
    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString('utf8');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Remarks');
    sheet.addRow(['Summary']);
    sheet.addRow([`Characters: ${text.length}`]);
    const outPath = `/tmp/remarks_${file.filename}.xlsx`;
    await workbook.xlsx.writeFile(outPath);
    res.download(outPath, 'remarks.xlsx');
  } catch (err) {
    console.error('File analysis failed', err);
    res.status(500).json({ message: 'Analysis failed' });
  }
});
