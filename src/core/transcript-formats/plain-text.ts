import type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";
import { splitSpeakerLabel } from "./speaker-label.ts";

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
      const turn = splitSpeakerLabel(line);
      if (turn) {
        segments.push({ ...turn, startMs: null, endMs: null });
      } else {
        const last = segments.at(-1);
        if (!last) return undefined;
        last.text = last.text === "" ? line : `${last.text}\n${line}`;
      }
    }
    return segments;
  },
};
