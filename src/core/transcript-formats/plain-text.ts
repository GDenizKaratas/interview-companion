import type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";

// A line that starts a turn: a speaker label, a colon followed by a space (or the end of the
// line), and what they said. The label has at least one letter, so a time such as "10:45" or
// "10:30" inside a sentence never starts a turn.
const turn = /^([^:]*\p{L}[^:]*):(?:\s+(.*))?$/u;

// Longer text before a colon is part of a sentence, not a speaker label.
const maxLabelLength = 40;

// Plain text with one turn per line, written as "Speaker: text". It has no times.
// A line without a label continues the turn before it, as pasted text often wraps.
// Blank lines are skipped. Text before the first label is refused, because no speaker can be
// given to it without guessing.
export const plainTextAdapter: TranscriptAdapter = {
  format: "plain-text",
  name: "plain text",
  extensions: [".txt"],
  parse(text) {
    const segments: ParsedSegment[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "") continue;
      const match = turn.exec(line);
      const label = match?.[1]!.trim();
      if (label !== undefined && label.length <= maxLabelLength) {
        segments.push({ speaker: label, text: (match![2] ?? "").trim(), startMs: null, endMs: null });
      } else {
        const last = segments.at(-1);
        if (!last) return undefined;
        last.text = last.text === "" ? line : `${last.text}\n${line}`;
      }
    }
    return segments;
  },
};
