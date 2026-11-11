import type { CvFile } from "./cv.ts";
import { readPdfText, UnreadablePdfError, type PdfTextLine } from "./pdf-text.ts";

// Words that name the document, not the person. A line made only of these is a heading.
const headingWords = new Set(["cv", "resume", "curriculum", "vitae", "ozgecmis"]);

// A suggestion for the name box when a Candidate is added from a CV: the largest text on the
// first page that is not a heading, or else a name made from the file name. Nothing is saved;
// the Interviewer checks and corrects it.
export async function guessCandidateName(file: CvFile): Promise<string> {
  return guessNameFromLines(await firstPageLines(file), file.fileName);
}

// The same guess for a CV whose first page has already been read.
export function guessNameFromLines(lines: PdfTextLine[], fileName: string): string {
  const fromText = largestText(lines);
  return fromText !== undefined && looksLikeName(fromText) ? fromText : nameFromFileName(fileName);
}

async function firstPageLines(file: CvFile): Promise<PdfTextLine[]> {
  try {
    return (await readPdfText(file.bytes))[0]?.lines ?? [];
  } catch (error) {
    if (error instanceof UnreadablePdfError) return [];
    throw error;
  }
}

function largestText(lines: PdfTextLine[]): string | undefined {
  let largest: PdfTextLine | undefined;
  for (const line of lines) {
    if (!isHeading(line.text) && (largest === undefined || line.size > largest.size)) largest = line;
  }
  return largest?.text;
}

// A name is a few words of letters: no digits, no e-mail address, no sentence.
function looksLikeName(text: string): boolean {
  return /\p{L}/u.test(text) && !/[\d@:/]/.test(text) && text.split(/\s+/).length <= 5 && text.length <= 60;
}

// "Ada_Demir_CV.pdf" becomes "Ada Demir": the extension, heading words, and words with digits
// (years, version numbers) are dropped, and _ - . separate words.
function nameFromFileName(fileName: string): string {
  const baseName = fileName.split(/[/\\]/).pop() ?? "";
  return baseName
    .replace(/\.[^.]*$/, "")
    .split(/[\s_.-]+/)
    .filter((word) => word !== "" && !/\d/.test(word) && !isHeading(word))
    .join(" ");
}

function isHeading(text: string): boolean {
  const words = plainWords(text);
  return words.length > 0 && words.every((word) => headingWords.has(word));
}

// The words of a text in a plain form for comparing: lower case, no accents or dots on letters,
// and no punctuation, so "ÖZGEÇMİŞ", "Özgeçmiş", and "Résumé" match "ozgecmis" and "resume".
function plainWords(text: string): string[] {
  return text
    .toLocaleLowerCase("en")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}
