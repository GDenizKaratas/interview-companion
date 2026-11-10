// Reads the text layer of a PDF with pdf.js. This is the only file that knows about pdf.js.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfTextLine {
  text: string;
  // The largest font size on the line, in points.
  size: number;
}

export interface PdfTextPage {
  // The page's text, line by line, exactly as it is stored and searched.
  text: string;
  lines: PdfTextLine[];
}

// Thrown when the bytes are not a PDF that pdf.js can open (damaged, password-protected, not a PDF).
export class UnreadablePdfError extends Error {}

export async function readPdfText(bytes: Uint8Array): Promise<PdfTextPage[]> {
  // pdf.js takes ownership of the buffer it is given, so it gets a copy. Only the text layer is
  // read: no fonts are loaded, and forms and scripts in the file are not run.
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let document;
  try {
    document = await task.promise;
  } catch {
    await task.destroy();
    throw new UnreadablePdfError();
  }
  try {
    const pages: PdfTextPage[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(toPage(content.items));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

interface TextItem {
  str: string;
  hasEOL: boolean;
  transform: number[];
}

function toPage(items: unknown[]): PdfTextPage {
  const lines: PdfTextLine[] = [];
  let text = "";
  let size = 0;
  const endLine = () => {
    const trimmed = text.trim();
    if (trimmed !== "") lines.push({ text: trimmed, size });
    text = "";
    size = 0;
  };
  for (const item of items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    if (item.str.trim() !== "") {
      const [, , c = 0, d = 0] = item.transform;
      size = Math.max(size, Math.hypot(c, d));
    }
    if (item.hasEOL) endLine();
  }
  endLine();
  return { text: lines.map((line) => line.text).join("\n"), lines };
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}
