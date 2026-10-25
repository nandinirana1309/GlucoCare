/**
 * GlucoCare - medical report text extraction (Phase 8)
 * -------------------------------------------------------------
 * Runs ENTIRELY IN THE BROWSER. The report file is never uploaded, never
 * stored, and never sent to an AI model.
 *
 *   validate (type, size, magic bytes)
 *        |
 *   PDF  -> pdf.js text layer per page
 *           page with (almost) no text = scanned -> render page -> OCR
 *   image -> OCR (Tesseract.js)
 *        |
 *   plain text -> lib/reportParser.ts (candidates) -> user review
 *
 * Both libraries are loaded on demand (dynamic import), only when the user
 * actually uploads a report. Tesseract downloads its OCR engine and English
 * language model from the jsDelivr CDN the first time it runs - the IMAGE
 * itself stays on the device.
 */

import { detectFileType } from "../lib/reportParser";
import type { DetectedFileType } from "../lib/reportParser";
import { validateReportFile } from "./reportService";

export const MAX_PDF_PAGES = 10;
/** Fewer characters than this on a PDF page means it is probably a scan. */
const MIN_TEXT_CHARS_PER_PAGE = 40;

export type ExtractionErrorCode =
  | "invalid-file"
  | "type-mismatch"
  | "encrypted"
  | "unreadable"
  | "ocr-unavailable"
  | "cancelled";

export class ReportExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  constructor(code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = "ReportExtractionError";
    this.code = code;
  }
}

export interface ExtractedText {
  text: string;
  fileType: DetectedFileType;
  method: "pdf_text" | "ocr" | "mixed";
  pageCount: number;
  /** Pages beyond MAX_PDF_PAGES that were not read. */
  skippedPages: number;
}

export type ProgressFn = (stage: string, fraction: number) => void;

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ReportExtractionError("cancelled", "Reading the report was cancelled.");
}

/* ------------------------------------------------------------------ */
/*  OCR (Tesseract.js)                                                 */
/* ------------------------------------------------------------------ */

type OcrWorker = { recognize: (image: HTMLCanvasElement | Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

async function createOcrWorker(onProgress: ProgressFn, signal?: AbortSignal): Promise<OcrWorker> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = (await createWorker("eng", undefined, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress("Reading text from the image (OCR)", m.progress);
        else onProgress("Preparing the OCR engine", m.progress);
      },
    })) as unknown as OcrWorker;
    signal?.addEventListener("abort", () => void worker.terminate(), { once: true });
    return worker;
  } catch {
    throw new ReportExtractionError(
      "ocr-unavailable",
      "The OCR engine could not be loaded (it needs an internet connection the first time). You can still add values by hand.",
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PDF (pdf.js)                                                       */
/* ------------------------------------------------------------------ */

interface PdfTextItem { str: string; transform: number[] }

/** Rebuilds reading-order lines from pdf.js text items (same y = same line). */
function itemsToLines(items: PdfTextItem[]): string {
  const rows = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5] / 2) * 2; // tolerate tiny baseline differences
    rows.set(y, [...(rows.get(y) ?? []), it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, row]) => row.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str.trim()).join("  "))
    .join("\n");
}

async function extractPdf(bytes: Uint8Array, onProgress: ProgressFn, signal?: AbortSignal): Promise<Omit<ExtractedText, "fileType">> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new ReportExtractionError("encrypted", "This PDF is password-protected. Please use an unprotected copy.");
    }
    throw new ReportExtractionError("unreadable", "This PDF could not be opened. It may be damaged.");
  }

  const pageCount = doc.numPages;
  const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES);
  const texts: string[] = [];
  let ocrWorker: OcrWorker | null = null;
  let usedText = false;
  let usedOcr = false;

  try {
    for (let i = 1; i <= pagesToRead; i++) {
      checkCancelled(signal);
      onProgress(`Reading page ${i} of ${pagesToRead}`, (i - 1) / pagesToRead);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = itemsToLines(content.items as PdfTextItem[]);

      if (text.replace(/\s/g, "").length >= MIN_TEXT_CHARS_PER_PAGE) {
        texts.push(text);
        usedText = true;
        continue;
      }

      // Scanned page: render it and run OCR.
      ocrWorker ??= await createOcrWorker(onProgress, signal);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      checkCancelled(signal);
      const { data } = await ocrWorker.recognize(canvas);
      texts.push(data.text);
      usedOcr = true;
      canvas.width = canvas.height = 0; // release the bitmap
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
    await doc.destroy();
  }

  return {
    text: texts.join("\n"),
    method: usedText && usedOcr ? "mixed" : usedOcr ? "ocr" : "pdf_text",
    pageCount,
    skippedPages: pageCount - pagesToRead,
  };
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export async function extractReportText(
  file: File,
  onProgress: ProgressFn = () => {},
  signal?: AbortSignal,
): Promise<ExtractedText> {
  const basic = validateReportFile(file);
  if (basic) throw new ReportExtractionError("invalid-file", basic);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectFileType(bytes.subarray(0, 16));
  const declared = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpeg";
  if (!detected) {
    throw new ReportExtractionError("type-mismatch", "This file is not a valid PDF, PNG or JPG (its contents do not match its type).");
  }
  if (detected !== declared) {
    throw new ReportExtractionError("type-mismatch", `This file says it is ${declared.toUpperCase()} but its contents are ${detected.toUpperCase()}. Please check the file.`);
  }
  checkCancelled(signal);

  try {
    if (detected === "pdf") {
      return { ...(await extractPdf(bytes, onProgress, signal)), fileType: "pdf" };
    }
    const worker = await createOcrWorker(onProgress, signal);
    try {
      const { data } = await worker.recognize(new Blob([bytes], { type: file.type }));
      checkCancelled(signal);
      return { text: data.text, fileType: detected, method: "ocr", pageCount: 1, skippedPages: 0 };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    if (error instanceof ReportExtractionError) throw error;
    if (signal?.aborted) throw new ReportExtractionError("cancelled", "Reading the report was cancelled.");
    throw new ReportExtractionError("unreadable", "The report could not be read. You can still add values by hand.");
  }
}
