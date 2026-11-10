import { ApiError, type TranscriptFormat } from "./api.ts";
import { fill, type Text } from "./languages.ts";

// A segment's start time as the Interviewer reads it: "4:05", or "1:02:09" after an hour.
// A missing time is never shown as 0:00; the caller shows text.panels.transcript.noTime instead.
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// "plain text (.txt)" for each format core supports, in the current language.
export function formatNames(text: Text, formats: TranscriptFormat[]): string {
  const names: Record<string, string> = text.panels.transcript.formats;
  return formats.map((f) => `${names[f.format] ?? f.format} (${f.extensions.join(", ")})`).join("; ");
}

// Core decides whether a Transcript is accepted; this only says why it was refused, in the current language.
export function transcriptRefusalMessage(text: Text, formats: TranscriptFormat[], error: unknown): string {
  const t = text.panels.transcript;
  if (error instanceof ApiError && error.field === "transcript") {
    if (error.rule === "format") return fill(t.refused.format, { formats: formatNames(text, formats) });
    if (error.rule === "encoding") return t.refused.encoding;
    if (error.rule === "required") return t.refused.required;
  }
  return t.importFailed;
}
