import { useState } from "react";
import type { CandidateOverview, Interview } from "./api.ts";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { candidatePath, linkTo } from "./navigation.ts";
import { useText } from "./text.tsx";

interface Entry {
  candidateId: string;
  candidateName: string;
  interview: Interview;
}

// A month of every Candidate's Interviews. Interviews that have taken place are faded; Planned
// ones stand out. Whether an Interview is Planned comes from core; the calendar only places it.
export function InterviewCalendar({ overviews }: { overviews: CandidateOverview[] }) {
  const { text, languageCode } = useText();
  const t = text.calendar;
  const today = localDay(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));

  const entries: Entry[] = overviews.flatMap((overview) =>
    overview.interviews.map((interview) => ({
      candidateId: overview.candidate.id,
      candidateName: overview.candidate.name,
      interview,
    })),
  );
  const byDay = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.interview.date === null) continue;
    byDay.set(entry.interview.date, [...(byDay.get(entry.interview.date) ?? []), entry]);
  }
  const upcoming = entries
    .filter((entry) => entry.interview.planned)
    .sort((a, b) => a.interview.date!.localeCompare(b.interview.date!))
    .slice(0, 6);
  const undated = entries.filter((entry) => entry.interview.date === null).length;

  const days = monthGrid(month);
  const monthTitle = new Intl.DateTimeFormat(languageCode, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    utcDate(`${month}-01`),
  );
  // 2024-01-01 was a Monday; weeks start on Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(languageCode, { weekday: "short", timeZone: "UTC" }).format(utcDate(addDays("2024-01-01", i))),
  );
  const shortDate = new Intl.DateTimeFormat(languageCode, { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });

  function label(entry: Entry): string {
    return `${entry.candidateName} · ${interviewName(text, entry.interview)}`;
  }

  return (
    <section className="calendar card" aria-labelledby="calendar-title">
      <header className="calendar-head">
        <h2 id="calendar-title">{t.title}</h2>
        <div className="calendar-nav">
          <button type="button" className="icon-button" aria-label={t.previous} title={t.previous} onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <button type="button" className="quiet" onClick={() => setMonth(today.slice(0, 7))}>
            {t.today}
          </button>
          <button type="button" className="icon-button" aria-label={t.next} title={t.next} onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
      </header>
      <p className="calendar-month">{monthTitle}</p>
      <div className="calendar-grid" role="grid" aria-label={monthTitle}>
        {weekdays.map((weekday) => (
          <span key={weekday} className="calendar-weekday" role="columnheader">
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const dayEntries = byDay.get(day) ?? [];
          const classes = ["calendar-day"];
          if (!day.startsWith(month)) classes.push("other-month");
          if (day === today) classes.push("today");
          if (day < today) classes.push("past");
          return (
            <div key={day} className={classes.join(" ")} role="gridcell">
              <span className="calendar-date">{Number(day.slice(8))}</span>
              {dayEntries.slice(0, 2).map((entry) => (
                <a
                  key={entry.interview.id}
                  className={entry.interview.planned ? "calendar-event planned" : "calendar-event"}
                  href={candidatePath(entry.candidateId)}
                  onClick={linkTo(candidatePath(entry.candidateId))}
                  title={label(entry)}
                >
                  {firstName(entry.candidateName)}
                </a>
              ))}
              {dayEntries.length > 2 && (
                <span className="calendar-more" title={dayEntries.slice(2).map(label).join("\n")}>
                  +{dayEntries.length - 2}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="calendar-legend">
        <span className="legend-swatch past" /> {t.legendPast}
        <span className="legend-swatch planned" /> {t.legendPlanned}
      </p>
      <h3 className="calendar-subtitle">{t.upcoming}</h3>
      {upcoming.length === 0 ? (
        <p className="empty">{t.noUpcoming}</p>
      ) : (
        <ol className="upcoming-list">
          {upcoming.map((entry) => (
            <li key={entry.interview.id}>
              <a href={candidatePath(entry.candidateId)} onClick={linkTo(candidatePath(entry.candidateId))}>
                <span className="upcoming-date">{shortDate.format(utcDate(entry.interview.date!))}</span>
                <span className="upcoming-who">{entry.candidateName}</span>
                <span className="upcoming-which">{interviewName(text, entry.interview)}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
      {undated > 0 && <p className="calendar-undated">{undated === 1 ? t.undatedOne : fill(t.undated, { count: String(undated) })}</p>}
    </section>
  );
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

// Today as a calendar day (YYYY-MM-DD) in the Interviewer's own time zone.
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function addDays(day: string, days: number): string {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(month: string, months: number): string {
  const date = utcDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

// The days shown for a month (YYYY-MM): whole weeks from Monday, covering the whole month.
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -((utcDate(first).getUTCDay() + 6) % 7));
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const days: string[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}
