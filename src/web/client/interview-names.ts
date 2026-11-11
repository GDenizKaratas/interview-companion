// How an Interview is named on screen, in the current language.
import type { Interview } from "./api.ts";
import { fill, type Text } from "./languages.ts";

// "First Interview", "Interview 11".
export function interviewName(text: Text, interview: Interview): string {
  return interviewNameOf(text, interview.number);
}

// The same name from the Interview's number alone.
export function interviewNameOf(text: Text, number: number): string {
  const ordinals: Record<string, string> = text.interviews.ordinal;
  return ordinals[String(number)] ?? fill(text.interviews.numbered, { number: String(number) });
}

// "First interview · 2026-11-20 · planned", "Second interview · no date".
export function interviewLabel(text: Text, interview: Interview): string {
  const name = interviewName(text, interview);
  if (interview.date === null) return `${name} · ${text.interviews.noDate}`;
  return interview.planned ? `${name} · ${interview.date} · ${text.interviews.planned}` : `${name} · ${interview.date}`;
}
