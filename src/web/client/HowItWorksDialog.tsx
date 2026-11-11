import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { useText } from "./text.tsx";

// The app in six steps, from adding a Candidate to reading the AI's notes, and the two ways to
// get AI for the last one.
export function HowItWorksDialog({ onUseApiKey, onUseMcp, onClose }: { onUseApiKey: () => void; onUseMcp: () => void; onClose: () => void }) {
  const { text } = useText();
  const t = text.howItWorks;
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
      <StepFlow steps={t.steps} label={t.title} />
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
