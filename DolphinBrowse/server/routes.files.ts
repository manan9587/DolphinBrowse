import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { fileTypeFromFile } from "file-type";

// These two don’t ship TS types by default; keep the @ts-ignore.
// @ts-ignore
import pdfParse from "pdf-parse";
// @ts-ignore
import * as mammoth from "mammoth";
import ExcelJS from "exceljs";

const TMP_DIR = "/tmp/uploads";
const upload = multer({ dest: TMP_DIR });
export const files = Router();

async function ensureTmpDir() {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
  } catch {}
}

function isAllowed(extOrMime: string): boolean {
  const ext = extOrMime.toLowerCase();
  const allowedExt = ["pdf", "docx", "xlsx", "csv", "txt"];
  const allowedMime = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
  ];
  return allowedExt.includes(ext) || allowedMime.includes(ext);
}

/**
 * POST /api/upload
 * Accepts one file and validates type.
 * Returns { fileId, originalName, mimetype }
 */
files.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    await ensureTmpDir();
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "NO_FILE" });

    // Prefer content sniffing, fallback to mimetype
    const detected = await fileTypeFromFile(file.path).catch(() => null);
    const ext = detected?.ext || "";
    const ok =
      (ext && isAllowed(ext)) ||
      (file.mimetype && isAllowed(file.mimetype));

    if (!ok) {
      return res.status(400).json({ error: "UNSUPPORTED_FILE" });
    }

    return res.json({
      fileId: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      detectedExt: ext || null,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "UPLOAD_FAILED" });
  }
});

/**
 * POST /api/files/analyze
 * Accepts one file and returns an Excel (remarks.xlsx) with a tiny summary.
 */
files.post("/api/files/analyze", upload.single("file"), async (req, res) => {
  try {
    await ensureTmpDir();
    const file = (req as any).file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const filePath = file.path as string;
    const buffer = await fs.readFile(filePath);

    // Detect by mime or extension
    const sniff = await fileTypeFromFile(filePath).catch(() => null);
    const ext = (sniff?.ext || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    let text = "";
    if (ext === "pdf" || mime === "application/pdf") {
      const data = await pdfParse(buffer);
      text = (data?.text || "").trim();
    } else if (
      ext === "docx" ||
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = (result?.value || "").trim();
    } else if (ext === "txt" || mime.startsWith("text/") || ext === "csv") {
      text = buffer.toString("utf8");
    } else if (
      ext === "xlsx" ||
      mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      // For XLSX we won’t parse all cells here; just note basic meta
      text = ""; // keep as empty; we’ll just log size below
    } else {
      // Fallback – still try UTF-8 read
      text = buffer.toString("utf8");
    }

    // Build a tiny remarks workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Remarks");

    sheet.addRow(["Summary"]);
    sheet.addRow([`Original Name: ${file.originalname}`]);
    sheet.addRow([`MIME: ${file.mimetype}`]);
    sheet.addRow([`Detected Ext: ${ext || "unknown"}`]);
    sheet.addRow([`Bytes: ${buffer.byteLength}`]);
    sheet.addRow([`Text Characters: ${text.length}`]);

    // Optional: include a short preview (first 1000 chars)
    const preview = text.slice(0, 1000).replace(/\r?\n/g, " ");
    sheet.addRow([]);
    sheet.addRow(["Preview (first 1000 chars)"]);
    sheet.addRow([preview || "(no textual content extracted)"]);

    const outPath = path.join("/tmp", `remarks_${file.filename}.xlsx`);
    await workbook.xlsx.writeFile(outPath);

    // Stream back as a download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="remarks.xlsx"');
    res.sendFile(outPath, (err) => {
      if (err) console.error("sendFile error:", err);
      // Optional cleanup:
      // fs.unlink(outPath).catch(()=>{});
      // fs.unlink(filePath).catch(()=>{});
    });
  } catch (err) {
    console.error("File analysis failed", err);
    res.status(500).json({ message: "Analysis failed" });
  }
});
