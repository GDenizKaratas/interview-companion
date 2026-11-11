import type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";
import { splitSpeakerLabel } from "./speaker-label.ts";

// A time before the speaker, as a note-taker's export may write it: "00:01:23", "1:23",
// "00:01:23.456" or with a comma, alone or in square or round brackets, then a space.
const lineTime = /^(?:\[([\d:.,]+)\]|\(([\d:.,]+)\)|([\d:.,]+))\s+(.*)$/;
const timeParts = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

// Plain text with one turn per line, written as "Speaker: text", optionally with a time in
// front. A line without a label continues the turn before it, as pasted text often wraps.
// Blank lines are skipped. A line may end as on Windows (CR LF), Unix (LF), or older tools (CR). Text before the first label is refused, because no speaker can be
// given to it without guessing. A turn has at most a start time; its end is not written.
export const plainTextAdapter: TranscriptAdapter = {
  format: "plain-text",
  name: "plain text",
  extensions: [".txt"],
  parse(text) {
    const segments: ParsedSegment[] = [];
    for (const rawLine of text.split(/\r\n|\r|\n/)) {
      const line = rawLine.trim();
      if (line === "") continue;
      const timed = timedTurn(line);
      const turn = timed ?? splitSpeakerLabel(line);
      if (turn) {
        segments.push({ speaker: turn.speaker, text: turn.text, startMs: timed?.startMs ?? null, endMs: null });
      } else {
        const last = segments.at(-1);
        if (!last) return undefined;
        last.text = last.text === "" ? line : `${last.text}\n${line}`;
      }
    }
    return segments;
  },
};

// A line that starts with a time and then a speaker label, or undefined. A time followed by
// anything else stays text, so a line that imported before reads the same.
function timedTurn(line: string): { speaker: string; text: string; startMs: number } | undefined {
  const [, square, round, bare, rest = ""] = lineTime.exec(line) ?? [];
  const parts = timeParts.exec(square ?? round ?? bare ?? "");
  const turn = parts ? splitSpeakerLabel(rest) : undefined;
  if (!parts || !turn) return undefined;
  const [, hours = "0", minutes = "0", seconds = "0", fraction = ""] = parts;
  const startMs =
    ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, "0"));
  return { ...turn, startMs };
}
