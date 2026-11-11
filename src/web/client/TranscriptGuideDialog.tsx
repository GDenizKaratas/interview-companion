import { useState } from "react";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openTranscriptGuide = "open-transcript-guide";

const routeKeys = ["teams", "zoom", "meet", "local"] as const;
type RouteKey = (typeof routeKeys)[number];

// How to get a Transcript file the app reads, by meeting tool: what each route needs, whether
// it does Turkish, and the steps to the file. Every fact comes from
// docs/research/getting-a-transcript.md; what it could not confirm is said to be unconfirmed.
export function TranscriptGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.transcriptGuide;
  const [chosen, setChosen] = useState<RouteKey>("teams");
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
