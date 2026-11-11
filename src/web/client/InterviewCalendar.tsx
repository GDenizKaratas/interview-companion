import { useState } from "react";
import { ExpandableCard } from "./ExpandableCard.tsx";
import type { DatedInterview } from "./api.ts";
import { localDay, longDay, shortDay, utcDate } from "./dates.ts";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { candidatePath, linkTo } from "./navigation.ts";
import { useText } from "./text.tsx";

type Range = "today" | "week" | "planned";

// A month of every Candidate's Interviews, and under it a list the Interviewer switches between
// today, this week, and everything Planned. Interviews that have taken place are faded; Planned ones stand out.
// Core decides the order within a day and whether an Interview is Planned; this only places them.
export function InterviewCalendar({ interviews, undated }: { interviews: DatedInterview[]; undated: number }) {
  const { text, languageCode } = useText();
  const t = text.calendar;
  const today = localDay(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  // The day whose Interviews are listed over the page.
  const [openDay, setOpenDay] = useState<string | undefined>();
  const [chosenRange, setChosenRange] = useState<Range | undefined>();

  const byDay = new Map<string, DatedInterview[]>();
  for (const entry of interviews) {
    const day = entry.interview.date!;
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  // Core says which Interviews are today, this week, and Planned.
  const ranges: Record<Range, DatedInterview[]> = {
    today: interviews.filter((entry) => entry.today),
    week: interviews.filter((entry) => entry.thisWeek),
    planned: interviews.filter(({ interview }) => interview.planned),
  };
  // Opens on the nearest range that has something to show.
  const range = chosenRange ?? (ranges.today.length > 0 ? "today" : ranges.week.length > 0 ? "week" : "planned");

  const days = monthGrid(month);
  const monthTitle = new Intl.DateTimeFormat(languageCode, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    utcDate(`${month}-01`),
  );
  // 2024-01-01 was a Monday; weeks start on Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(languageCode, { weekday: "short", timeZone: "UTC" }).format(utcDate(addDays("2024-01-01", i))),
  );

  function label(entry: DatedInterview): string {
    const time = entry.interview.time === null ? "" : `${entry.interview.time} · `;
    return `${time}${entry.candidate.name} · ${interviewName(text, entry.interview)}`;
  }

  return (
    <ExpandableCard
      className="panel calendar"
      title={t.title}
      actions={
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
      }
    >
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
          if (dayEntries.length > 0) classes.push("busy");
          return (
            // A click on a day with Interviews lists them all; a click on one name opens that Candidate.
            <div
              key={day}
              className={classes.join(" ")}
              role="gridcell"
              onClick={(event) => {
                if (dayEntries.length > 0 && !(event.target as Element).closest("a, button")) setOpenDay(day);
              }}
            >
              {dayEntries.length > 0 ? (
                // A button, so the list of the day also opens from the keyboard.
                <button type="button" className="calendar-date" title={t.openDay} aria-label={`${longDay(languageCode, day)}: ${t.openDay}`} onClick={() => setOpenDay(day)}>
                  {Number(day.slice(8))}
                </button>
              ) : (
                <span className="calendar-date">{Number(day.slice(8))}</span>
              )}
              {/* Every Interview is listed; outside full screen, CSS shows two and the "+n" button. */}
              {dayEntries.map((entry) => (
                <a
                  key={entry.interview.id}
                  className={entry.interview.planned ? "calendar-event planned" : "calendar-event"}
                  href={candidatePath(entry.candidate.id)}
                  onClick={linkTo(candidatePath(entry.candidate.id))}
                  title={label(entry)}
                >
                  {entry.interview.time !== null && <span className="calendar-event-time">{entry.interview.time}</span>}
                  {firstName(entry.candidate.name)}
                </a>
              ))}
              {dayEntries.length > 2 && (
                <button type="button" className="calendar-more" title={t.openDay} onClick={() => setOpenDay(day)}>
                  {fill(t.more, { count: String(dayEntries.length - 2) })}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="calendar-legend">
        <span className="legend-swatch past" /> {t.legendPast}
        <span className="legend-swatch planned" /> {t.legendPlanned}
      </p>
      <div className="calendar-ranges" role="group" aria-label={t.rangesLabel}>
        {(["today", "week", "planned"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={range === key}
            className={range === key ? "range-tab chosen" : "range-tab"}
            onClick={() => setChosenRange(key)}
          >
            {t.ranges[key]}
            <span className="range-count">{ranges[key].length}</span>
          </button>
        ))}
      </div>
      {ranges[range].length === 0 ? (
        <p className="empty">{t.emptyRanges[range]}</p>
      ) : (
        <InterviewList entries={ranges[range]} today={today} withDays={range !== "today"} />
      )}
      {undated > 0 && <p className="calendar-undated">{undated === 1 ? t.undatedOne : fill(t.undated, { count: String(undated) })}</p>}
      {openDay && (
        <ModalDialog
          title={longDay(languageCode, openDay)}
          wide
          onCancel={() => setOpenDay(undefined)}
          actions={
            <button type="button" autoFocus onClick={() => setOpenDay(undefined)}>
              {t.closeDay}
            </button>
          }
        >
          <InterviewList entries={byDay.get(openDay) ?? []} today={today} withDays={false} />
        </ModalDialog>
      )}
    </ExpandableCard>
  );
}

// Interviews one under the other, each starting with its time. With days, each day gets a
// heading, and today's says "Today".
function InterviewList({ entries, today, withDays }: { entries: DatedInterview[]; today: string; withDays: boolean }) {
  const { text, languageCode } = useText();
  const t = text.calendar;
  return (
    <ol className="interview-list">
      {entries.map((entry, i) => {
        const { candidate, interview } = entry;
        const day = interview.date!;
        const newDay = withDays && day !== entries[i - 1]?.interview.date;
        return (
          <li key={interview.id}>
            {newDay && <h4 className={day === today ? "interview-list-day today" : "interview-list-day"}>{day === today ? t.today : shortDay(languageCode, day, today)}</h4>}
            <a
              className={interview.planned ? "interview-list-row planned" : "interview-list-row"}
              href={candidatePath(candidate.id)}
              onClick={linkTo(candidatePath(candidate.id))}
            >
              <span className="interview-list-time">{interview.time ?? t.noTime}</span>
              <span className="interview-list-who">{candidate.name}</span>
              <span className="interview-list-which">
                {interviewName(text, interview)} · {candidate.role}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
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
