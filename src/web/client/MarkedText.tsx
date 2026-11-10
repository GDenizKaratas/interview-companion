import type { Highlight } from "./api.ts";
import { markedParts } from "./marked-parts.ts";

// Text with the given parts marked, as a search result or a found segment shows its match.
export function MarkedText({ text, highlights }: { text: string; highlights: Highlight[] }) {
  return (
    <>
      {markedParts(text, highlights).map((part, i) => (part.marked ? <mark key={i}>{part.text}</mark> : part.text))}
    </>
  );
}
