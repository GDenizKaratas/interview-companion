import type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";
import { splitSpeakerLabel } from "./speaker-label.ts";

// A cue's timing line: "start --> end", each "hh:mm:ss.ttt" with the hours optional, then
// optional cue settings such as "align:start", which only change how captions are drawn.
const time = String.raw`(?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}`;
const timing = new RegExp(String.raw`^(${time})[ \t]+-->[ \t]+(${time})(?:[ \t].*)?$`);

// A voice tag, "<v Name>" or "<v.class Name>", names who speaks the text after it.
const voiceTag = /^v(?:\.[^\s]*)?[ \t]+(.+)$/s;

const characterEscapes: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  lrm: "‎",
  rlm: "‏",
};

// WebVTT (https://www.w3.org/TR/webvtt1/), the caption format Microsoft Teams and Zoom export.
// Each cue is one segment with its start and end time. The speaker comes from the cue's voice
// tag, or from a "Name: text" start when there is no voice tag, as Zoom writes it. Formatting
// tags are removed, and a cue's lines are joined with a space, because they only wrap the caption
// on screen. The header, NOTE, STYLE, and REGION blocks are skipped. A block that is none of
// these and has no timing line refuses the whole file, so no spoken text is lost without notice.
export const webVttAdapter: TranscriptAdapter = {
  format: "webvtt",
  name: "WebVTT",
  extensions: [".vtt"],
  parse(text) {
    const blocks = text
      .split(/\r\n|\r|\n/)
      .join("\n")
      .trim()
      .split(/\n[ \t]*\n/)
      .map((block) => block.split("\n"));
    if (!/^WEBVTT(?:[ \t].*)?$/.test(blocks[0]![0]!)) return undefined;
    const segments: ParsedSegment[] = [];
    // The first block is the header: the WEBVTT line and any metadata after it.
    for (const lines of blocks.slice(1)) {
      if (/^NOTE(?:[ \t]|$)/.test(lines[0]!) || /^(?:STYLE|REGION)$/.test(lines[0]!)) continue;
      // A cue may start with an id line before its timing line.
      const timingIndex = lines.slice(0, 2).findIndex((line) => timing.test(line));
      if (timingIndex === -1) return undefined;
      const [, start, end] = timing.exec(lines[timingIndex]!)!;
      for (const turn of turnsOf(lines.slice(timingIndex + 1).join(" "))) {
        // Captions often split one long turn over several cues and name the speaker only once.
        // Text before any speaker is named is refused, because its speaker would be a guess.
        const speaker = turn.speaker ?? segments.at(-1)?.speaker;
        if (speaker === undefined) return undefined;
        segments.push({ speaker, text: turn.text, startMs: toMs(start!), endMs: toMs(end!) });
      }
    }
    return segments;
  },
};

// A cue's text split at its voice tags, with every other tag removed and escapes read.
// Text with no voice tag and no "Name: " start has no speaker. Empty turns are left out.
function turnsOf(payload: string): { speaker: string | undefined; text: string }[] {
  const turns: { speaker: string | undefined; text: string }[] = [{ speaker: undefined, text: "" }];
  for (const [, textPart, tag] of payload.matchAll(/([^<]*)(?:<([^>]*)>?)?/g)) {
    turns.at(-1)!.text += readEscapes(textPart!);
    const voice = tag === undefined ? undefined : voiceTag.exec(tag);
    if (voice) turns.push({ speaker: voice[1]!.trim(), text: "" });
  }
  return turns
    .map(({ speaker, text }) => {
      const trimmed = text.replace(/[ \t]+/g, " ").trim();
      return speaker === undefined ? (splitSpeakerLabel(trimmed) ?? { speaker, text: trimmed }) : { speaker, text: trimmed };
    })
    .filter((turn) => turn.text !== "");
}

function readEscapes(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (escape, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
    }
    return characterEscapes[name] ?? escape;
  });
}

function toMs(time: string): number {
  const parts = time.split(":").map(Number);
  const seconds = parts.pop()!;
  const minutes = parts.pop()!;
  const hours = parts.pop() ?? 0;
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}
