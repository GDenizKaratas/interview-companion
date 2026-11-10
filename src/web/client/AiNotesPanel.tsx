import { useEffect, useState } from "react";
import { AiNoteItem } from "./AiNoteItem.tsx";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api, ApiError, type AiNote, type Interview, type Transcript } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";

interface AiNotesPanelProps {
  interviews: Interview[];
  selectedInterviewId: string | null;
  // Changes whenever the Transcript panel imports a Transcript or confirms its speakers.
  transcriptVersion: number;
  onShowEvidence: (interviewId: string, segmentNumber: number) => void;
}

// The AI Notes panel. AI Notes belong to one Interview's Transcript, so like the Transcript
// panel it shows the selected Interview's notes, or asks the Interviewer to select one.
export function AiNotesPanel({ interviews, selectedInterviewId, transcriptVersion, onShowEvidence }: AiNotesPanelProps) {
  const { text } = useText();
  const t = text.panels.aiNotes;
  const selected = interviews.find((interview) => interview.id === selectedInterviewId);
  if (interviews.length === 0) return <p className="empty">{t.noInterview}</p>;
  if (!selected) return <p className="empty">{t.selectInterview}</p>;
  return (
    <InterviewAiNotes
      key={selected.id}
      interview={selected}
      transcriptVersion={transcriptVersion}
      onShowEvidence={(segmentNumber) => onShowEvidence(selected.id, segmentNumber)}
    />
  );
}

function InterviewAiNotes({
  interview,
  transcriptVersion,
  onShowEvidence,
}: {
  interview: Interview;
  transcriptVersion: number;
  onShowEvidence: (segmentNumber: number) => void;
}) {
  const { text } = useText();
  const t = text.panels.aiNotes;
  const [apiKeySaved, setApiKeySaved] = useState<boolean | undefined>();
  // undefined while loading, null when the Interview has no Transcript.
  const [transcript, setTranscript] = useState<Transcript | null | undefined>();
  const [notes, setNotes] = useState<AiNote[] | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>();
  const [dropped, setDropped] = useState(0);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    const loadKey = () => api.getApiKeyStatus().then((status) => setApiKeySaved(status.saved), () => setLoadFailed(true));
    void loadKey();
    window.addEventListener(apiKeyChanged, loadKey);
    return () => window.removeEventListener(apiKeyChanged, loadKey);
  }, []);

  // A new or replaced Transcript, or newly confirmed speakers, change what can be generated
  // and which notes exist, so both are loaded again.
  useEffect(() => {
    api.getTranscript(interview.id).then(setTranscript, () => setLoadFailed(true));
    api.listAiNotes(interview.id).then(setNotes, () => setLoadFailed(true));
  }, [interview.id, transcriptVersion]);

  async function generate() {
    setConfirmingReplace(false);
    setGenerating(true);
    setGenerateError(undefined);
    setDropped(0);
    try {
      const result = await api.generateAiNotes(interview.id);
      setNotes(result.notes);
      setDropped(result.dropped);
    } catch (error) {
      setGenerateError(error);
    } finally {
      setGenerating(false);
    }
  }

  // Regenerating replaces only Unreviewed notes, so it asks first only when there are some.
  const unreviewedCount = notes?.filter((note) => note.reviewState === "unreviewed").length ?? 0;
  const startGenerate = () => (unreviewedCount > 0 ? setConfirmingReplace(true) : void generate());
  const dismissedCount = notes?.filter((note) => note.reviewState === "dismissed").length ?? 0;
  // Dismissed notes are hidden unless the Interviewer asks to see them.
  const visibleNotes = notes?.filter((note) => showDismissed || note.reviewState !== "dismissed") ?? [];
  const replaceNote = (changed: AiNote) =>
    setNotes((current) => current?.map((note) => (note.id === changed.id ? changed : note)));
  const confirmed = transcript ? transcript.speakerMappingConfirmedAt !== null : false;
  const segmentTimes = new Map(transcript?.segments.map((segment) => [segment.number, segment.startMs]));

  return (
    <div className="ai-notes">
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {apiKeySaved === false && (
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
              <button type="button" disabled={!confirmed || generating} onClick={startGenerate}>
                {generating ? t.generating : notes && notes.length > 0 ? t.regenerate : t.generate}
              </button>
              {confirmed && <p className="hint">{t.whatIsSent}</p>}
            </>
          )}
        </div>
      )}
      {generateError !== undefined && <p className="error">{generationErrorMessage(text, generateError)}</p>}
      {dropped > 0 && <p className="hint">{fill(t.dropped, { count: String(dropped) })}</p>}
      {notes && notes.length === 0 && dropped === 0 && apiKeySaved && transcript && confirmed && !generating && (
        <p className="empty">{t.empty}</p>
      )}
      {/* Regenerating replaces Unreviewed Stale notes, so the warning goes away once it is done.
          Reviewed Stale notes are kept and still carry their own tag. */}
      {visibleNotes.some((note) => note.stale && note.reviewState === "unreviewed") && (
        <p className="stale-banner">{t.staleBanner}</p>
      )}
      {visibleNotes.length > 0 && (
        <ul className="ai-note-list">
          {visibleNotes.map((note) => (
            <AiNoteItem
              key={note.id}
              note={note}
              segmentTimes={segmentTimes}
              onShowEvidence={onShowEvidence}
              onChanged={replaceNote}
            />
          ))}
        </ul>
      )}
      {dismissedCount > 0 && (
        <button type="button" className="link-button ai-notes-dismissed-toggle" onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? t.hideDismissed : fill(t.showDismissed, { count: String(dismissedCount) })}
        </button>
      )}
      {confirmingReplace && (
        <ConfirmDialog
          title={t.confirmRegenerate}
          confirmLabel={t.regenerateConfirm}
          cancelLabel={t.cancel}
          onConfirm={() => void generate()}
          onCancel={() => setConfirmingReplace(false)}
        >
          <p>{fill(t.confirmRegenerateDetail, { count: String(unreviewedCount) })}</p>
        </ConfirmDialog>
      )}
      {settingsOpen && <ApiKeyDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// What went wrong, in the Interviewer's language. Every failure says the data is unchanged,
// because core saves nothing unless generation succeeds.
function generationErrorMessage(text: Text, error: unknown): string {
  const t = text.panels.aiNotes.errors;
  if (error instanceof ApiError) {
    if (error.reason) return t.reasons[error.reason];
    if (error.failure) return `${t.failed} ${t.failures[error.failure]}`;
  }
  return t.failed;
}
