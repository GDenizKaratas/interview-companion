import type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";
import { splitSpeakerLabel } from "./speaker-label.ts";

// A cue's timing line: "start --> end", each "hh:mm:ss.ttt" with the hours optional, then
// optional cue settings such as "align:start", which only change how captions are drawn.
// Spaces around the arrow are optional, as in the W3C parser.
const time = String.raw`(?:\d+:)?[0-5]\d:[0-5]\d\.\d{3}`;
const timing = new RegExp(String.raw`^(${time})[ \t]*-->[ \t]*(${time})(?:[ \t].*)?$`);

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

// Part of a cue's text, with the speaker it was given, if any.
interface Turn {
  speaker: string | undefined;
  text: string;
}

// WebVTT (https://www.w3.org/TR/webvtt1/), the caption format Microsoft Teams and Zoom export.
// Each cue is one segment with its start and end time. The speaker comes from the cue's voice
// tag, or from a "Name: text" line when there is no voice tag, as Zoom writes it. Formatting
// tags are removed, and a cue's lines are joined with a space, because they only wrap the caption
// on screen. The header, NOTE, STYLE, and REGION blocks are skipped. A block that is none of
// these and has no timing line refuses the whole file, so no spoken text is lost without notice.
export const webVttAdapter: TranscriptAdapter = {
  format: "webvtt",
  name: "WebVTT",
  extensions: [".vtt"],
  parse(text) {
    const [header, ...blocks] = text
      .split(/\r\n|\r|\n/)
      .join("\n")
      .trim()
      .split(/\n[ \t]*\n/)
      .map((block) => block.split("\n"));
    if (!/^WEBVTT(?:[ \t].*)?$/.test(header![0]!)) return undefined;
    // A cue right under the WEBVTT line, with no blank line between, would be read as header.
    if (header!.some((line) => line.includes("-->"))) return undefined;
    const segments: ParsedSegment[] = [];
    let speaker: string | undefined;
    for (const lines of blocks) {
      if (/^NOTE(?:[ \t]|$)/.test(lines[0]!) || /^(?:STYLE|REGION)$/.test(lines[0]!)) continue;
      // A cue may start with an id line before its timing line.
      const timingIndex = lines.slice(0, 2).findIndex((line) => timing.test(line));
      if (timingIndex === -1) return undefined;
      const [, start, end] = timing.exec(lines[timingIndex]!)!;
      for (const turn of turnsOf(lines.slice(timingIndex + 1))) {
        // Captions often split one long turn over several cues and name the speaker only once,
        // so a speaker named even with no text carries on to the next cues.
        speaker = turn.speaker ?? speaker;
        if (turn.text === "") continue;
        // Text before any speaker is named is refused, because its speaker would be a guess.
        if (speaker === undefined) return undefined;
        segments.push({ speaker, text: turn.text, startMs: toMs(start!), endMs: toMs(end!) });
      }
    }
    return segments;
  },
};

// A cue's text split at its voice tags, with every other tag removed and escapes read. Text
// outside a voice tag starts a new turn at each line that begins with "Name: ". Other text
// has no speaker. A "<" with no ">" after it is kept as text, so no words are lost.
function turnsOf(payload: string[]): Turn[] {
  const voiced: Turn[] = [{ speaker: undefined, text: "" }];
  for (const [, textPart, tag] of payload.join("\n").matchAll(/([^]*?)(?:<([^<>]*)>|$)/g)) {
    voiced.at(-1)!.text += textPart!;
    const voice = tag === undefined ? undefined : voiceTag.exec(tag);
    if (voice) voiced.push({ speaker: readEscapes(voice[1]!).trim(), text: "" });
  }
  return voiced.flatMap(({ speaker, text }) => {
    if (speaker !== undefined) return [{ speaker, text: clean(text) }];
    const turns: Turn[] = [];
    for (const line of text.split("\n").map(clean)) {
      const labelled = splitSpeakerLabel(line);
      const last = turns.at(-1);
      if (labelled || !last) turns.push(labelled ?? { speaker: undefined, text: line });
      else last.text = [last.text, line].filter((part) => part !== "").join(" ");
    }
    return turns;
  });
}

// Reads escapes and puts the lines of a cue on one line with single spaces.
function clean(text: string): string {
  return readEscapes(text.replace(/[ \t\n]+/g, " ")).trim();
}

function readEscapes(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (escape, name: string) => {
    if (name.startsWith("#")) {
      const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      // Zero, the halves of surrogate pairs, and numbers past Unicode are not characters.
      const isCharacter = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return isCharacter ? String.fromCodePoint(code) : escape;
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
