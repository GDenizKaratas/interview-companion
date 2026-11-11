// How an Interview is named on screen, in the current language.
import type { Interview } from "./api.ts";
import { localDay, shortDay } from "./dates.ts";
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

// "17 Nov Tue 10:00", or "no date".
export function interviewWhen(text: Text, languageCode: string, interview: Interview): string {
  if (interview.date === null) return text.interviews.noDate;
  const day = shortDay(languageCode, interview.date, localDay(new Date()));
  return interview.time === null ? day : `${day} ${interview.time}`;
}

// "First Interview · 17 Nov Tue 10:00 · planned", "Second Interview · no date".
export function interviewLabel(text: Text, languageCode: string, interview: Interview): string {
  const label = `${interviewName(text, interview)} · ${interviewWhen(text, languageCode, interview)}`;
  return interview.planned ? `${label} · ${text.interviews.planned}` : label;
}
