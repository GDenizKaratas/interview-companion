import { useEffect, useRef, useState } from "react";
import { api, ApiError, type CandidateOverview, type InterviewPlan, type InterviewPlanRequest } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { localDay, shortDay } from "./dates.ts";
import { fill, type Text } from "./languages.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { useText } from "./text.tsx";

// How long after the last change the times are asked for again, so typing a number sends one request.
const replanDelay = 150;

// The day, first time, length, and break as typed in their fields.
interface Settings {
  date: string;
  firstTime: string;
  minutes: string;
  breakMinutes: string;
}

// The outcome of adding one Interview: added, or the refusal from the server.
type Outcome = { planned: true } | { planned: false; error: unknown };

type Phase =
  | { kind: "choosing" }
  | { kind: "planning"; done: number; total: number }
  | { kind: "finished"; outcomes: Map<string, Outcome> };

// "Plan Interviews" on the Candidate list: one day, a first time, a length and a break, and the
// Candidates ticked in the order they will be met. Core works out each time; the dialog shows
// them, lets one be typed by hand, and adds the Interviews one at a time through core.
export function PlanInterviewsDialog({
  candidates,
  showRole,
  onClose,
}: {
  // The Candidates of the list as it was filtered when the dialog opened, every page of it.
  candidates: CandidateOverview[];
  showRole: boolean;
  // planned is true when at least one Interview was added, so the list and calendar load again.
  onClose: (planned: boolean) => void;
}) {
  const { text, languageCode } = useText();
  const t = text.planInterviews;
  // The list is kept as it was on opening, so a row never moves while the Interviewer ticks.
  const [rows] = useState(candidates);
  const [settings, setSettings] = useState<Settings | undefined>();
  // The ids of the ticked Candidates, in the order they were ticked.
  const [chosen, setChosen] = useState<string[]>([]);
  // Times typed by hand, by Candidate id.
  const [typed, setTyped] = useState<Record<string, string>>({});
  // Core's answer, with the request it answers, so an answer to an older request is never used.
  const [plan, setPlan] = useState<{ key: string; plan: InterviewPlan } | undefined>();
  // Set when core's last answer was a refusal; cleared by its next plan.
  const [planError, setPlanError] = useState<{ error: unknown } | undefined>();
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });
  const [confirming, setConfirming] = useState<"stop" | "discard" | undefined>();
  const stopRequested = useRef(false);
  const plannedAny = useRef(false);

  useEffect(() => {
    api.suggestInterviewPlan().then(
      (suggested) =>
        setSettings({
          date: suggested.date,
          firstTime: suggested.firstTime,
          minutes: String(suggested.minutes),
          breakMinutes: String(suggested.breakMinutes),
        }),
      // Without core's suggestion the fields start empty; core says what is missing.
      () => setSettings({ date: "", firstTime: "", minutes: "", breakMinutes: "" }),
    );
  }, []);

  const request: InterviewPlanRequest | undefined = settings && {
    date: settings.date,
    firstTime: settings.firstTime,
    minutes: settings.minutes.trim() === "" ? Number.NaN : Number(settings.minutes),
    breakMinutes: settings.breakMinutes.trim() === "" ? Number.NaN : Number(settings.breakMinutes),
    times: chosen.map((id) => typed[id] ?? null),
  };
  const requestKey = request ? JSON.stringify(request) : undefined;

  // Core works out the times again after each change, once changes pause. The request is read
  // back from its key, so the effect runs once for each different request.
  useEffect(() => {
    if (requestKey === undefined) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.planInterviewTimes(JSON.parse(requestKey) as InterviewPlanRequest, controller.signal).then(
        (answer) => {
          setPlan({ key: requestKey, plan: answer });
          setPlanError(undefined);
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setPlanError({ error });
        },
      );
    }, replanDelay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);

  const current = plan !== undefined && plan.key === requestKey ? plan.plan : undefined;
  // The last refusal stays shown until core answers again, so it does not flicker while typing.
  const refusal = planError?.error;
  // Until the new answer arrives, the rows keep showing the last times core gave.
  const shownPlan = plan?.plan;

  function toggle(id: string, ticked: boolean) {
    setChosen((list) => (ticked ? [...list, id] : list.filter((other) => other !== id)));
    if (!ticked) setTyped((all) => without(all, id));
  }

  function chooseAll() {
    setChosen((list) => [...list, ...rows.map(({ candidate }) => candidate.id).filter((id) => !list.includes(id))]);
  }

  function chooseNone() {
    setChosen([]);
    setTyped({});
  }

  // Adds the Interviews one at a time, so one refusal does not stop the others and the progress
  // is real. Core checks each date and time again when it is saved.
  async function planAll() {
    if (!current) return;
    const toPlan = chosen.map((id, i) => ({ id, time: current.slots[i]!.time }));
    const outcomes = new Map<string, Outcome>();
    stopRequested.current = false;
    setPhase({ kind: "planning", done: 0, total: toPlan.length });
    for (const [i, { id, time }] of toPlan.entries()) {
      if (stopRequested.current) break;
      try {
        await api.addInterview({ candidateId: id, date: current.date, time });
        outcomes.set(id, { planned: true });
        plannedAny.current = true;
      } catch (error) {
        outcomes.set(id, { planned: false, error });
      }
      setPhase({ kind: "planning", done: i + 1, total: toPlan.length });
    }
    if (stopRequested.current) {
      onClose(plannedAny.current);
      return;
    }
    setPhase({ kind: "finished", outcomes });
  }

  // Escape, the × button, or Cancel. While planning, or with Candidates ticked, the Interviewer is asked first.
  function requestClose() {
    if (phase.kind === "planning") setConfirming("stop");
    else if (phase.kind === "choosing" && chosen.length > 0) setConfirming("discard");
    else onClose(plannedAny.current);
  }

  // Stop and close: the Interview being added is finished first. If planning ended while the
  // question was open, there is nothing left to stop.
  function confirmStop() {
    setConfirming(undefined);
    if (phase.kind !== "planning") onClose(plannedAny.current);
    else stopRequested.current = true;
  }

  const today = localDay(new Date());
  const position = new Map(chosen.map((id, i) => [id, i]));
  const choosing = phase.kind === "choosing";
  const ready = current !== undefined && chosen.length > 0 && current.refused === 0;

  // The range and the count that do not fit also stay as last answered, so the line does not flicker.
  const lastRange = current ?? shownPlan;
  const summary =
    chosen.length === 0
      ? t.noneChosen
      : lastRange?.from && lastRange.to
        ? fill(chosen.length === 1 ? t.chosenOne : t.chosen, { count: String(chosen.length), from: lastRange.from, to: lastRange.to })
        : fill(t.chosenNoRange, { count: String(chosen.length) });

  const content =
    phase.kind === "finished" ? (
      <FinishedReport text={text} rows={rows} outcomes={phase.outcomes} />
    ) : (
      <div className="plan-interviews">
        <fieldset className="plan-fields" disabled={!choosing || !settings}>
          <label>
            {t.dayLabel}
            <input
              type="date"
              value={settings?.date ?? ""}
              onChange={(event) => setSettings((s) => s && { ...s, date: event.target.value })}
            />
          </label>
          <label>
            {t.firstTimeLabel}
            <input
              type="time"
              value={settings?.firstTime ?? ""}
              onChange={(event) => setSettings((s) => s && { ...s, firstTime: event.target.value })}
            />
          </label>
          <label>
            {t.minutesLabel}
            <input
              type="number"
              // The arrows move by five minutes; any whole number can be typed.
              min={5}
              step={5}
              inputMode="numeric"
              value={settings?.minutes ?? ""}
              onChange={(event) => setSettings((s) => s && { ...s, minutes: event.target.value })}
            />
          </label>
          <label>
            {t.breakLabel}
            <input
              type="number"
              min={0}
              step={5}
              inputMode="numeric"
              value={settings?.breakMinutes ?? ""}
              onChange={(event) => setSettings((s) => s && { ...s, breakMinutes: event.target.value })}
            />
          </label>
        </fieldset>
        {refusal !== undefined ? <p className="error">{planRefusal(text, refusal)}</p> : <p className="form-hint">{t.intro}</p>}
        {rows.length === 0 ? (
          <p className="empty">{t.empty}</p>
        ) : (
          <>
            <p className="add-many-summary" aria-live="polite">
              <span>{summary}</span>
              {chosen.length > 0 && lastRange && lastRange.refused > 0 && (
                <span className="add-many-bad">{fill(t.doNotFit, { count: String(lastRange.refused) })}</span>
              )}
              {choosing && chosen.length < rows.length && (
                <button type="button" className="link-button" onClick={chooseAll}>
                  {t.chooseAll}
                </button>
              )}
              {choosing && chosen.length > 0 && (
                <button type="button" className="link-button" onClick={chooseNone}>
                  {t.chooseNone}
                </button>
              )}
            </p>
            <ul className="add-many-rows plan-rows">
              {rows.map(({ candidate, nextPlanned }) => {
                const place = position.get(candidate.id);
                const slot = place === undefined ? undefined : shownPlan?.slots[place];
                return (
                  <li key={candidate.id} className={place === undefined ? "plan-row" : "plan-row chosen"}>
                    <label className="plan-who">
                      <input
                        type="checkbox"
                        checked={place !== undefined}
                        disabled={!choosing}
                        onChange={(event) => toggle(candidate.id, event.target.checked)}
                      />
                      <span className="plan-name">{candidate.name}</span>
                      {showRole && <span className="plan-role">{candidate.role}</span>}
                    </label>
                    <span className="plan-already">
                      {nextPlanned &&
                        fill(t.plannedAlready, {
                          when: [shortDay(languageCode, nextPlanned.date!, today), nextPlanned.time].filter(Boolean).join(" "),
                        })}
                    </span>
                    <span className="plan-time">
                      {place !== undefined && (
                        <>
                          {slot?.refusal === "afterMidnight" && <span className="add-many-bad">{t.afterMidnight}</span>}
                          {slot?.refusal == null && slot?.sharesTime && <span className="add-many-warn">{t.sameTime}</span>}
                          <input
                            type="time"
                            className={slot?.refusal ? "refused" : slot?.typed ? "typed" : undefined}
                            aria-label={fill(t.timeFor, { name: candidate.name })}
                            value={typed[candidate.id] ?? slot?.time ?? ""}
                            disabled={!choosing}
                            onChange={(event) => {
                              const value = event.target.value;
                              setTyped((all) => ({ ...all, [candidate.id]: value }));
                            }}
                            // A field left empty goes back to the time of its place.
                            onBlur={(event) => {
                              if (event.target.value === "") setTyped((all) => without(all, candidate.id));
                            }}
                          />
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    );

  const actions =
    phase.kind === "finished" ? (
      <button type="button" onClick={() => onClose(plannedAny.current)}>
        {t.close}
      </button>
    ) : phase.kind === "planning" ? (
      <span className="add-many-progress" aria-live="polite">
        {fill(t.progress, { done: String(phase.done), total: String(phase.total) })}
      </span>
    ) : (
      <>
        <button type="button" className="secondary" onClick={requestClose}>
          {t.cancel}
        </button>
        <button type="button" disabled={!ready} onClick={planAll}>
          {chosen.length === 0 ? t.planNone : chosen.length === 1 ? t.planOne : fill(t.planCount, { count: String(chosen.length) })}
        </button>
      </>
    );

  return (
    <>
      <ModalDialog title={t.title} kind="form" wide large onCancel={requestClose} actions={actions}>
        {content}
      </ModalDialog>
      {confirming === "stop" && (
        <ConfirmDialog
          title={t.confirmClose.title}
          confirmLabel={t.confirmClose.stop}
          cancelLabel={t.confirmClose.keepGoing}
          onConfirm={confirmStop}
          onCancel={() => setConfirming(undefined)}
        >
          <p>{t.confirmClose.detail}</p>
        </ConfirmDialog>
      )}
      {confirming === "discard" && (
        <ConfirmDialog
          title={t.confirmDiscard.title}
          confirmLabel={t.confirmDiscard.close}
          cancelLabel={t.confirmDiscard.keep}
          onConfirm={() => {
            setConfirming(undefined);
            onClose(plannedAny.current);
          }}
          onCancel={() => setConfirming(undefined)}
        >
          <p>{t.confirmDiscard.detail}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

// After planning: how many were planned, and every Candidate who was not, with the reason.
function FinishedReport({ text, rows, outcomes }: { text: Text; rows: CandidateOverview[]; outcomes: Map<string, Outcome> }) {
  const t = text.planInterviews;
  const planned = [...outcomes.values()].filter((outcome) => outcome.planned).length;
  const failed = rows.flatMap(({ candidate }) => {
    const outcome = outcomes.get(candidate.id);
    return outcome && !outcome.planned ? [{ candidate, reason: saveRefusal(text, outcome.error) }] : [];
  });
  return (
    <div className="add-many-report">
      <p className="add-many-added">
        {planned === 0 ? t.plannedNone : planned === 1 ? t.plannedOne : fill(t.planned, { count: String(planned) })}
      </p>
      {failed.length > 0 && (
        <>
          <p className="add-many-not-added">{fill(t.notPlanned, { count: String(failed.length) })}</p>
          <ul className="add-many-rows">
            {failed.map(({ candidate, reason }) => (
              <li key={candidate.id} className="add-many-row report">
                <span className="add-many-file">{candidate.name}</span>
                <span className="add-many-reason">{reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Core refused the day, a time, the length, or the break; this says which, in the current language.
function planRefusal(text: Text, error: unknown): string {
  const refused = text.planInterviews.refused;
  if (error instanceof ApiError && error.status === 400) {
    if (error.field === "date") return refused.date;
    if (error.field === "firstTime") return refused.firstTime;
    if (error.field === "minutes") return refused.minutes;
    if (error.field === "breakMinutes") return refused.breakMinutes;
    if (error.field === "time") return refused.time;
  }
  return refused.other;
}

// Core refused one Interview when it was saved; this says why, in the current language.
function saveRefusal(text: Text, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return text.planInterviews.candidateGone;
    if (error.field === "date") return text.interviews.invalidDate;
    if (error.field === "time") return text.interviews.invalidTime;
  }
  return text.interviews.saveFailed;
}

function without(times: Record<string, string>, id: string): Record<string, string> {
  const rest = { ...times };
  delete rest[id];
  return rest;
}
