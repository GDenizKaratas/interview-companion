import { useState } from "react";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { stepIcons } from "./step-icons.ts";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openTranscriptGuide = "open-transcript-guide";

// Google Meet comes first because most people look for it first. Its own transcript has no
// Turkish, so its tab gives Tactiq for those who stay on Meet, then Teams and Zoom.
const routeKeys = ["meet", "teams", "zoom", "local"] as const;
type RouteKey = (typeof routeKeys)[number];

// Tactiq's page in the Chrome Web Store, checked on 2026-11-11.
const tactiqStorePage = "https://chromewebstore.google.com/detail/tactiq-ai-note-taker-for/fggkaccpbmombhnjkjokndojfgagejfb";

// One small line drawing for each step of each route, in the order of its steps.
const routeIcons: Record<RouteKey, string[][]> = {
  teams: [stepIcons.speech, stepIcons.pageDown, stepIcons.pageUp],
  zoom: [stepIcons.cloud, stepIcons.pageDown, stepIcons.pageUp],
  meet: [stepIcons.pageDown, stepIcons.speech, stepIcons.pageUp],
  local: [stepIcons.camera, stepIcons.laptop, stepIcons.nameTag, stepIcons.pageUp],
};

// How to get a Transcript file the app reads, by meeting tool: in one line whether the route does
// Turkish and what it needs, then the steps to the file, then what to tell the Candidate. Every
// fact comes from docs/research/getting-a-transcript.md; what it could not confirm is said to be
// unconfirmed. The dialog is held near the top, so the route buttons stay in place when a route
// of another length is chosen.
export function TranscriptGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.transcriptGuide;
  const [chosen, setChosen] = useState<RouteKey>("meet");
  const route = t.routes[chosen];
  const steps = route.steps.map((step, index) => ({ ...step, icon: routeIcons[chosen][index] ?? [] }));

  return (
    <ModalDialog
      title={t.title}
      kind="info"
      large
      top
      onCancel={onClose}
      actions={
        <button type="button" autoFocus onClick={onClose}>
          {t.close}
        </button>
      }
    >
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
      {chosen === "meet" && (
        <div className="guide-route-title">
          <h3>{t.meetRoutes.tactiqTitle}</h3>
          {/* Tactiq is another company's product; the app only names it and links to its store page. */}
          <a className="link-as-button" href={tactiqStorePage} target="_blank" rel="noreferrer">
            {t.meetRoutes.tactiqAdd}
          </a>
        </div>
      )}
      {steps.length > 0 && <StepFlow steps={steps} label={route.name} />}
      {route.notes.map((note) => (
        <p key={note} className="guide-note">
          {note}
        </p>
      ))}
      {chosen === "meet" && (
        <p className="guide-note guide-other-tools">
          <strong>{t.meetRoutes.otherTitle}</strong>{" "}
          <button type="button" className="link-button" onClick={() => setChosen("teams")}>
            {t.routes.teams.name}
          </button>
          {t.meetRoutes.otherBetween}
          <button type="button" className="link-button" onClick={() => setChosen("zoom")}>
            {t.routes.zoom.name}
          </button>
          {t.meetRoutes.otherAfter}
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
