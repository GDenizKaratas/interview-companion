import { useState } from "react";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openTranscriptGuide = "open-transcript-guide";

// Google Meet comes first because most people look for it first, and they learn at once that it
// does not transcribe Turkish and where to go instead.
const routeKeys = ["meet", "teams", "zoom", "local"] as const;
type RouteKey = (typeof routeKeys)[number];

// How to get a Transcript file the app reads, by meeting tool: what each route needs, whether
// it does Turkish, and the steps to the file. Every fact comes from
// docs/research/getting-a-transcript.md; what it could not confirm is said to be unconfirmed.
export function TranscriptGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.transcriptGuide;
  const [chosen, setChosen] = useState<RouteKey>("meet");
  const route = t.routes[chosen];

  return (
    <ModalDialog
      title={t.title}
      kind="info"
      large
      onCancel={onClose}
      actions={
        <button type="button" autoFocus onClick={onClose}>
          {t.close}
        </button>
      }
    >
      <p className="guide-intro">{t.reads}</p>
      <div className="view-choice guide-routes" role="group" aria-label={t.routesLabel}>
        {routeKeys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={chosen === key}
            className={chosen === key ? "role-choice chosen" : "role-choice"}
            onClick={() => setChosen(key)}
          >
            <RouteIcon route={key} />
            {t.routes[key].name}
          </button>
        ))}
      </div>
      <p className="guide-route-needs">{route.needs}</p>
      {route.steps.length > 0 && <StepFlow steps={route.steps} label={route.name} />}
      {route.notes.map((note) => (
        <p key={note} className="guide-note">
          {note}
        </p>
      ))}
      {chosen === "meet" && (
        <p className="guide-note">
          <button type="button" className="link-button" onClick={() => setChosen("local")}>
            {t.meetInstead}
          </button>
        </p>
      )}
      <section className="guide-box" aria-labelledby="transcript-consent-title">
        <h3 id="transcript-consent-title">{t.consent.title}</h3>
        <ul>
          {t.consent.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>{t.consent.notLegalAdvice}</p>
      </section>
      <p className="guide-note">{t.checked}</p>
    </ModalDialog>
  );
}

// A small picture in each tool's own colours, so the Interviewer finds theirs at a glance. They
// only name the products; the app has no tie to their makers.
function RouteIcon({ route }: { route: RouteKey }) {
  return (
    <svg className="guide-route-icon" viewBox="0 0 20 20" aria-hidden="true">
      {route === "meet" && (
        <>
          <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5H6v10H3.5A1.5 1.5 0 0 1 2 13.5z" fill="#2684fc" />
          <path d="M6 5h6.5A1.5 1.5 0 0 1 14 6.5V8H6z" fill="#00ac47" />
          <path d="M6 12h8v1.5a1.5 1.5 0 0 1-1.5 1.5H6z" fill="#ffba00" />
          <path d="M14 8l4-2.6v9.2L14 12z" fill="#00832d" />
          <rect x="6" y="8" width="8" height="4" fill="#ffffff" />
        </>
      )}
      {route === "teams" && (
        <>
          <rect x="2" y="3" width="16" height="14" rx="3" fill="#5059c9" />
          <path d="M6.5 7h7M10 7v6.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
        </>
      )}
      {route === "zoom" && (
        <>
          <rect x="2" y="3" width="16" height="14" rx="4" fill="#0b5cff" />
          <rect x="5" y="7.5" width="6.5" height="5" rx="1.2" fill="#ffffff" />
          <path d="M12.3 9.3l2.7-1.6v4.6l-2.7-1.6z" fill="#ffffff" />
        </>
      )}
      {route === "local" && (
        <>
          <rect x="3.5" y="4" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M1.5 16h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
