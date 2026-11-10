import { useEffect, useState } from "react";
import { generationErrorMessage } from "./AiNotesPanel.tsx";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api, type AskedQuestion, type AskedQuestions, type Interview, type Transcript } from "./api.ts";
import { ExchangeDialog } from "./ExchangeDialog.tsx";
import { fill } from "./languages.ts";
import { useText } from "./text.tsx";

interface AskedQuestionsPanelProps {
  interviews: Interview[];
  selectedInterviewId: string | null;
  // Changes whenever the Transcript panel imports a Transcript or confirms its speakers.
  transcriptVersion: number;
  onShowEvidence: (interviewId: string, segmentNumber: number) => void;
  // Called after the questions are found, so the Saved Questions can show where they were asked.
  onFound: () => void;
}

// The questions asked in the selected Interview, each with what the Candidate answered. One
// click opens the exchange from the Transcript. Nothing is generated until the Interviewer asks.
export function AskedQuestionsPanel({ interviews, selectedInterviewId, transcriptVersion, onShowEvidence, onFound }: AskedQuestionsPanelProps) {
  const { text } = useText();
  const t = text.panels.askedQuestions;
  const selected = interviews.find((interview) => interview.id === selectedInterviewId);
  if (interviews.length === 0) return <p className="empty">{t.noInterview}</p>;
  if (!selected) return <p className="empty">{t.selectInterview}</p>;
  return (
    <InterviewAskedQuestions
      key={selected.id}
      interview={selected}
      transcriptVersion={transcriptVersion}
      onShowEvidence={(segmentNumber) => onShowEvidence(selected.id, segmentNumber)}
      onFound={onFound}
    />
  );
}

function InterviewAskedQuestions({
  interview,
  transcriptVersion,
  onShowEvidence,
  onFound,
}: {
  interview: Interview;
  transcriptVersion: number;
  onShowEvidence: (segmentNumber: number) => void;
  onFound: () => void;
}) {
  const { text } = useText();
  const t = text.panels.askedQuestions;
  const [apiKeySaved, setApiKeySaved] = useState<boolean | undefined>();
  // undefined while loading, null when the Interview has no Transcript.
  const [transcript, setTranscript] = useState<Transcript | null | undefined>();
  // undefined while loading, null when the questions were never looked for.
  const [asked, setAsked] = useState<AskedQuestions | null | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<unknown>();
  const [dropped, setDropped] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [open, setOpen] = useState<AskedQuestion | undefined>();

  useEffect(() => {
    const loadKey = () => api.getApiKeyStatus().then((status) => setApiKeySaved(status.saved), () => setLoadFailed(true));
    void loadKey();
    window.addEventListener(apiKeyChanged, loadKey);
    return () => window.removeEventListener(apiKeyChanged, loadKey);
  }, []);

  // A Transcript imported and then confirmed starts two loads quickly; only the newer one may fill the panel.
  useEffect(() => {
    let current = true;
    Promise.all([api.getTranscript(interview.id), api.listAskedQuestions(interview.id)]).then(
      ([loadedTranscript, loadedAsked]) => {
        if (!current) return;
        setTranscript(loadedTranscript);
        setAsked(loadedAsked);
        setLoadFailed(false);
      },
      () => current && setLoadFailed(true),
    );
    return () => {
      current = false;
    };
  }, [interview.id, transcriptVersion]);

  // Finding again replaces the Interview's Asked Questions. There is no review work to lose, so it does not ask first.
  async function find() {
    setFinding(true);
    setFindError(undefined);
    setDropped(0);
    try {
      const result = await api.findAskedQuestions(interview.id);
      setDropped(result.dropped);
      setAsked(await api.listAskedQuestions(interview.id));
      onFound();
    } catch (error) {
      setFindError(error);
    } finally {
      setFinding(false);
    }
  }

  const confirmed = transcript ? transcript.speakerMappingConfirmedAt !== null : false;
  const questions = asked?.askedQuestions ?? [];

  return (
    <div className="asked-questions">
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {asked === null && transcript && confirmed && <p className="hint">{t.notYet}</p>}
      {apiKeySaved === false && (asked === null || asked?.stale) && (
        <div className="ai-notes-empty">
          <p className="empty">{t.noApiKey}</p>
          <button type="button" className="quiet" onClick={() => setSettingsOpen(true)}>
            {t.addApiKey}
          </button>
        </div>
      )}
      {apiKeySaved && transcript !== undefined && (
        <div className="ai-notes-generate">
          {transcript === null && <p className="hint">{t.noTranscript}</p>}
          {transcript && !confirmed && <p className="ai-notes-gate">{t.confirmSpeakersFirst}</p>}
          {transcript && (
            <>
              <button type="button" className={asked ? "quiet" : undefined} disabled={!confirmed || finding} onClick={() => void find()}>
                {finding ? t.finding : asked ? t.findAgain : t.find}
              </button>
              {confirmed && !asked && <p className="hint">{t.whatIsSent}</p>}
            </>
          )}
        </div>
      )}
      {findError !== undefined && <p className="error">{generationErrorMessage(text, findError)}</p>}
      {dropped > 0 && <p className="hint">{fill(t.dropped, { count: String(dropped) })}</p>}
      {asked?.stale && <p className="stale-banner">{t.stale}</p>}
      {asked && questions.length === 0 && <p className="empty">{t.empty}</p>}
      {questions.length > 0 && (
        <ol className="asked-question-list">
          {questions.map((question) => (
            <li key={question.id}>
              <button type="button" className="asked-question" onClick={() => setOpen(question)}>
                <span className="asked-question-text">
                  {question.question}
                  {question.savedQuestionId !== null && <span className="asked-question-saved">{t.savedQuestion}</span>}
                  {question.source === "aiClient" && <span className="source-tag">{t.fromAiClient}</span>}
                </span>
                <span className="asked-question-summary">{question.answerSummary}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {open && (
        <ExchangeDialog
          askedQuestion={open}
          onOpenInTranscript={() => onShowEvidence(open.firstSegment)}
          onClose={() => setOpen(undefined)}
        />
      )}
      {settingsOpen && <ApiKeyDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
