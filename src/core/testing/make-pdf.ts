// Builds small, valid PDF files for tests and the demo CV, so a test shows the text of its PDF
// next to what it expects. Each page is a list of lines written top to bottom in Helvetica;
// a page with no lines has a grey box and no text, like a scanned page.

export interface PdfLine {
  text: string;
  // Font size in points.
  size: number;
}

const pageWidth = 595;
const pageHeight = 842;
const margin = 56;

// Helvetica's standard encoding has no Turkish ş, ğ, ı, İ. These byte codes are given those
// letters through the font's Differences array, so the text can be extracted again unchanged.
const extraLetters: Record<string, { code: number; glyph: string }> = {
  Ş: { code: 0x80, glyph: "Scedilla" },
  ş: { code: 0x81, glyph: "scedilla" },
  Ğ: { code: 0x82, glyph: "Gbreve" },
  ğ: { code: 0x83, glyph: "gbreve" },
  İ: { code: 0x84, glyph: "Idotaccent" },
  ı: { code: 0x85, glyph: "dotlessi" },
};

export function makePdf(pages: PdfLine[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);

  const differences = Object.values(extraLetters)
    .map(({ code, glyph }) => `${code} /${glyph}`)
    .join(" ");
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, i) => 4 + i * 2);
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ` +
      `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${differences}] >> >>`,
  );
  for (const [i, lines] of pages.entries()) {
    const content = pageContent(lines);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
    );
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, body] of objects.entries()) {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  file += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  // Every character of the file is a single byte (text is written as hex), so latin1 is exact.
  return new Uint8Array(Buffer.from(file, "latin1"));
}

function pageContent(lines: PdfLine[]): string {
  if (lines.length === 0) {
    return `0.8 g ${margin} ${margin} ${pageWidth - 2 * margin} ${pageHeight - 2 * margin} re f`;
  }
  let y = pageHeight - margin;
  const operations = lines.map(({ text, size }) => {
    y -= size * 1.4;
    return `BT /F1 ${size} Tf ${margin} ${y.toFixed(1)} Td <${hex(text)}> Tj ET`;
  });
  return operations.join("\n");
}

function hex(text: string): string {
  return [...text]
    .map((letter) => {
      const code = extraLetters[letter]?.code ?? letter.charCodeAt(0);
      if (code > 0xff) throw new Error(`makePdf cannot write the letter "${letter}".`);
      return code.toString(16).padStart(2, "0");
    })
    .join("");
}
