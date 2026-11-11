import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { stepIcons } from "./step-icons.ts";
import { useText } from "./text.tsx";

// The place of "Upload the Transcript" among the steps.
const transcriptStep = 3;

// One small line drawing for each step, in the order of the steps.
const icons = [stepIcons.addPerson, stepIcons.page, stepIcons.calendar, stepIcons.pageUp, stepIcons.people, stepIcons.checkList];

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
    icon: icons[index] ?? [],
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
