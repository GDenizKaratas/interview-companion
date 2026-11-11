// How a calendar day is written on screen, in the current language.

// Today as a calendar day (YYYY-MM-DD) in the Interviewer's own time zone.
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A calendar day as a date at midnight UTC, so formatting it with the UTC time zone never
// moves it to the day before or after.
export function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

// "12 Nov Thu"; with the year when it is not this year: "3 Jan 2027 Sun".
export function shortDay(languageCode: string, day: string, today: string): string {
  return new Intl.DateTimeFormat(languageCode, {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(utcDate(day));
}

// "Thursday, 12 November 2026".
export function longDay(languageCode: string, day: string): string {
  return new Intl.DateTimeFormat(languageCode, { dateStyle: "full", timeZone: "UTC" }).format(utcDate(day));
}
