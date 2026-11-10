// The "Speaker: text" rule, shared by every format that writes the speaker in front of the text.

// A speaker label, a colon followed by a space (or the end of the line), and what they said.
// The label has at least one letter, so a time such as "10:45" or "10:30" inside a sentence
// never starts a turn.
const turn = /^([^:]*\p{L}[^:]*):(?:\s+(.*))?$/u;

// Longer text before a colon is part of a sentence, not a speaker label.
const maxLabelLength = 40;

// Splits a trimmed line into its speaker label and text, or returns undefined when the line
// does not start with a speaker label.
export function splitSpeakerLabel(line: string): { speaker: string; text: string } | undefined {
  const match = turn.exec(line);
  const speaker = match?.[1]!.trim();
  if (speaker === undefined || speaker.length > maxLabelLength) return undefined;
  return { speaker, text: (match![2] ?? "").trim() };
}
