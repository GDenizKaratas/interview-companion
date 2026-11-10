import type { ReactNode } from "react";
import type { Highlight } from "./api.ts";

// Text with the given parts marked, as a search result or a found segment shows its match.
export function MarkedText({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { start, end } of highlights) {
    // Parts that overlap one already marked only extend it.
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) parts.push(text.slice(at, from));
    parts.push(<mark key={from}>{text.slice(from, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
