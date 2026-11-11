import { useState } from "react";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { stepIcons } from "./step-icons.ts";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openTranscriptGuide = "open-transcript-guide";

const routeKeys = ["teams", "zoom", "meet", "local"] as const;
type RouteKey = (typeof routeKeys)[number];

// One small line drawing for each step of each route, in the order of its steps.
const routeIcons: Record<RouteKey, string[][]> = {
  teams: [stepIcons.speech, stepIcons.pageDown, stepIcons.pageUp],
  zoom: [stepIcons.cloud, stepIcons.pageDown, stepIcons.pageUp],
  meet: [],
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
  const [chosen, setChosen] = useState<RouteKey>("teams");
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
            {t.routes[key].name}
          </button>
        ))}
      </div>
      <p className="guide-route-needs">{route.needs}</p>
      {steps.length > 0 && <StepFlow steps={steps} label={route.name} />}
      {route.notes.map((note) => (
        <p key={note} className="guide-note">
          {note}
        </p>
      ))}
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
