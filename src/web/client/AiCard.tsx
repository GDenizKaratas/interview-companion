import { useEffect, useState } from "react";
import { AiNotesPanel, generationErrorMessage } from "./AiNotesPanel.tsx";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api, type Interview, type InterviewAiStep } from "./api.ts";
import { AskedQuestionsPanel } from "./AskedQuestionsPanel.tsx";
import { openMcpGuide } from "./McpGuideDialog.tsx";
import { useText } from "./text.tsx";

interface AiCardProps {
  interviews: Interview[];
  selectedInterviewId: string | null;
  // Changes whenever the Transcript is imported or its speakers are confirmed.
  transcriptVersion: number;
  onShowEvidence: (interviewId: string, segmentNumber: number) => void;
  // Called after Asked Questions are pulled out, so the Saved Questions can show where they were asked.
  onFound: () => void;
  // Shows the Transcript, where it is imported and its speakers are confirmed.
  onGoToTranscript: () => void;
}

// The body of the AI card. The AI is the Interviewer's note-taker here, never a judge: it reads
// the Transcript and pulls out the questions asked and what the Candidate said, each with a
// quote, and the Interviewer checks them. Until there is output, the card shows where the
// Interviewer is on the way to it, the one next step with its button, and who does what. Core
// says which step an Interview is at.
export function AiCard({ interviews, selectedInterviewId, transcriptVersion, onShowEvidence, onFound, onGoToTranscript }: AiCardProps) {
  const { text } = useText();
  const t = text.panels.ai;
  const selected = interviews.find((interview) => interview.id === selectedInterviewId);
  if (!selected) {
    return (
      <div className="ai-card">
        <p className="empty">{interviews.length === 0 ? t.noInterview : t.selectInterview}</p>
        <Division />
      </div>
    );
  }
  // The key starts each Interview with a fresh state, so nothing of another Interview shows.
  return (
    <InterviewAiCard
      key={selected.id}
      interview={selected}
      interviews={interviews}
      transcriptVersion={transcriptVersion}
      onShowEvidence={onShowEvidence}
      onFound={onFound}
      onGoToTranscript={onGoToTranscript}
    />
  );
}

function InterviewAiCard({
  interview,
  interviews,
  transcriptVersion,
  onShowEvidence,
  onFound,
  onGoToTranscript,
}: Omit<AiCardProps, "selectedInterviewId"> & { interview: Interview }) {
  const { text } = useText();
  const t = text.panels.ai;
  const [step, setStep] = useState<InterviewAiStep | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  // What the one action is doing: nothing, pulling out the questions, or writing the notes.
  const [running, setRunning] = useState<"questions" | "notes" | undefined>();
  const [runError, setRunError] = useState<unknown>();
  // Counts runs and API key changes, so the step is asked of core again.
  const [changes, setChanges] = useState(0);
  // Asked Questions come first: after an Interview they are what is needed most.
  const [tab, setTab] = useState<"asked" | "notes">("asked");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKeyChanged = () => setChanges((count) => count + 1);
    window.addEventListener(apiKeyChanged, onKeyChanged);
    return () => window.removeEventListener(apiKeyChanged, onKeyChanged);
  }, []);

  useEffect(() => {
    let current = true;
    api.getInterviewAiStep(interview.id).then(
      (answer) => {
        if (!current) return;
        setStep(answer.step);
        setLoadFailed(false);
      },
      () => current && setLoadFailed(true),
    );
    return () => {
      current = false;
    };
  }, [interview.id, transcriptVersion, changes]);

  // The one action: the questions first, then the notes. If the first fails, nothing more is
  // asked of the model; if the second fails, the questions that were pulled out stay.
  async function run() {
    setRunError(undefined);
    try {
      setRunning("questions");
      await api.findAskedQuestions(interview.id);
      onFound();
      setRunning("notes");
      await api.generateAiNotes(interview.id);
    } catch (error) {
      setRunError(error);
    } finally {
      setRunning(undefined);
      setChanges((count) => count + 1);
    }
  }

  if (loadFailed) return <p className="error">{t.loadFailed}</p>;
  if (step === undefined) return null;

  if (step === "done" && running === undefined) {
    return (
      <>
        <div className="card-tabs" role="group" aria-label={t.title}>
          {(["asked", "notes"] as const).map((key) => (
            <button key={key} type="button" aria-pressed={tab === key} className={tab === key ? "ai-tab selected" : "ai-tab"} onClick={() => setTab(key)}>
              {key === "asked" ? t.askedTab : t.notesTab}
            </button>
          ))}
        </div>
        {runError !== undefined && <p className="error">{generationErrorMessage(text, runError)}</p>}
        {tab === "asked" ? (
          <AskedQuestionsPanel
            interviews={interviews}
            selectedInterviewId={interview.id}
            transcriptVersion={transcriptVersion}
            onShowEvidence={onShowEvidence}
            onFound={onFound}
          />
        ) : (
          <AiNotesPanel interviews={interviews} selectedInterviewId={interview.id} transcriptVersion={transcriptVersion} onShowEvidence={onShowEvidence} />
        )}
        <p className="ai-promise">{t.promise}</p>
      </>
    );
  }

  // Which of the four steps the Interviewer is at: the Transcript, the speakers, the AI's draft, their own check.
  const at = step === "importTranscript" ? 0 : step === "confirmSpeakers" ? 1 : step === "done" ? 3 : 2;
  const notHeldYet = interview.planned || interview.date === null;

  return (
    <div className="ai-card">
      <ol className="ai-steps" aria-label={t.title}>
        {t.steps.map((name, index) => (
          <li key={name} className={index < at ? "ai-step past" : index === at ? "ai-step current" : "ai-step"} aria-current={index === at ? "step" : undefined}>
            <span className="ai-step-mark">{index < at ? "✓" : index + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <div className="ai-next">
        {running !== undefined ? (
          <p role="status">{running === "questions" ? t.running : t.runningNotes}</p>
        ) : step === "importTranscript" ? (
          <>
            <p>{notHeldYet ? t.next.planned : t.next.importTranscript}</p>
            {!notHeldYet && (
              <button type="button" className="secondary" onClick={onGoToTranscript}>
                {t.goToTranscript}
              </button>
            )}
          </>
        ) : step === "confirmSpeakers" ? (
          <>
            <p>{t.next.confirmSpeakers}</p>
            <button type="button" className="secondary" onClick={onGoToTranscript}>
              {t.goToTranscript}
            </button>
          </>
        ) : step === "connectAi" ? (
          <>
            <p>{t.next.connectAi}</p>
            <span className="ai-next-actions">
              <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
                {t.addApiKey}
              </button>
              <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(openMcpGuide))}>
                {text.mcpGuide.open}
              </button>
            </span>
          </>
        ) : (
          <>
            <p>{t.next.run}</p>
            <button type="button" onClick={() => void run()}>
              {t.run}
            </button>
          </>
        )}
      </div>
      {runError !== undefined && <p className="error">{generationErrorMessage(text, runError)}</p>}
      {step === "run" && running === undefined && (
        <dl className="ai-sent">
          <dt>{t.sent}</dt>
          <dd>
            {t.sentItems.map((item) => (
              <span key={item} className="pill planned">
                {item}
              </span>
            ))}
          </dd>
          <dt>{t.stays}</dt>
          <dd>
            {t.staysItems.map((item) => (
              <span key={item} className="pill">
                {item}
              </span>
            ))}
          </dd>
        </dl>
      )}
      {/* When the card holds the action and what it sends, one sentence says the same in less room. */}
      {step === "run" ? <p className="ai-promise">{t.promise}</p> : <Division />}
      {settingsOpen && <ApiKeyDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// Who does what, as two boxes: the AI drafts, the Interviewer checks and decides. The
// Interviewer's box is the heavier one, and the eye ends on it.
function Division() {
  const { text } = useText();
  const t = text.panels.ai.division;
  return (
    <div className="ai-division">
      <div className="ai-division-box ai">
        <strong>{t.ai}</strong>
        <span>{t.aiDoes}</span>
      </div>
      <span className="ai-division-arrow" aria-hidden="true">
        →
      </span>
      <div className="ai-division-box you">
        <strong>{t.you}</strong>
        <span>{t.youDo}</span>
      </div>
    </div>
  );
}
