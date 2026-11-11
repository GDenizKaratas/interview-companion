import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { useText } from "./text.tsx";

// The place of "Upload the Transcript" among the steps.
const transcriptStep = 3;

// One small line drawing for each step, in the order of the steps: a person with a plus, a page,
// a calendar, a page with an arrow up, two people, and a list with ticks.
const stepIcons: string[][] = [
  ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3", "M18 13v6M15 16h6"],
  ["M6.5 3h7.5l4 4v14h-11.5z", "M14 3v4h4", "M9.5 12h6M9.5 15.5h6"],
  ["M4 6h16v14H4z", "M4 10h16", "M8 3.5v4M16 3.5v4", "M8 14h3"],
  ["M6.5 3h7.5l4 4v14h-11.5z", "M14 3v4h4", "M12 17.5v-6M9.5 13.5l2.5-2.5 2.5 2.5"],
  ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M2.5 19c.5-3 2.6-4.8 5.5-4.8s5 1.8 5.5 4.8", "M16.5 10.5a2.5 2.5 0 1 0 0-5", "M17 14.3c2.3.4 3.9 2 4.5 4.7"],
  ["M4 7l1.8 1.8L9 5.5", "M4 13.5l1.8 1.8L9 12", "M12 7.5h8M12 14h8M4.5 19.5h15.5"],
];

function StepIcon({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

// The app in six steps, from adding a Candidate to reading the AI's notes, and the two ways to
// get AI for the last one. The Transcript step links to the guide on getting one.
export function HowItWorksDialog({
  onUseApiKey,
  onUseMcp,
  onTranscriptGuide,
  onClose,
}: {
  onUseApiKey: () => void;
  onUseMcp: () => void;
  onTranscriptGuide: () => void;
  onClose: () => void;
}) {
  const { text } = useText();
  const t = text.howItWorks;
  const steps = t.steps.map((step, index) => ({
    ...step,
    icon: <StepIcon paths={stepIcons[index] ?? []} />,
    extra:
      index === transcriptStep ? (
        <button type="button" className="link-button step-link" onClick={onTranscriptGuide}>
          {text.transcriptGuide.open}
        </button>
      ) : undefined,
  }));
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
      <StepFlow steps={steps} label={t.title} />
      <p className="guide-note">
        {t.ai}{" "}
        <button type="button" className="link-button" onClick={onUseApiKey}>
          {text.aiSettings.open}
        </button>{" "}
        ·{" "}
        <button type="button" className="link-button" onClick={onUseMcp}>
          {text.mcpGuide.open}
        </button>
      </p>
    </ModalDialog>
  );
}
