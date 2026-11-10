// The common shape every Transcript format is read into. Core stores and shows only this shape,
// so supporting a new format means writing a new adapter, not changing core.

export interface ParsedSegment {
  // The speaker label exactly as the file writes it.
  speaker: string;
  text: string;
  // Milliseconds from the start of the Interview, or null when the file has no time for it.
  // A missing time is never replaced by 0.
  startMs: number | null;
  endMs: number | null;
}

export interface TranscriptAdapter {
  // A stable id for the format, stored with each Transcript.
  format: string;
  // The format's name in English, used in core's messages, such as "plain text".
  name: string;
  // The file name endings this adapter reads, in lower case, such as ".txt".
  extensions: string[];
  // Reads the file's text into segments, in the order they were spoken, or returns undefined
  // when the text is not in this format.
  parse(text: string): ParsedSegment[] | undefined;
}
