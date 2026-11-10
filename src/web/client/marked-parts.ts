import type { Highlight } from "./api.ts";

// Splits text into parts that are marked or not, in order. Highlights that overlap one already
// marked only extend it.
export function markedParts(text: string, highlights: Highlight[]): { text: string; marked: boolean }[] {
  const parts: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const { start, end } of [...highlights].sort((a, b) => a.start - b.start)) {
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) parts.push({ text: text.slice(at, from), marked: false });
    parts.push({ text: text.slice(from, end), marked: true });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), marked: false });
  return parts;
}
