import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, type Highlight, type Interview, type Transcript, type TranscriptFormat } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { MarkedText } from "./MarkedText.tsx";
import { SpeakerMapping } from "./SpeakerMapping.tsx";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { openTranscriptGuide } from "./TranscriptGuideDialog.tsx";
import { useText } from "./text.tsx";
import { formatNames, formatTime, transcriptRefusalMessage } from "./transcript-text.ts";

export interface SegmentHighlight {
  interviewId: string;
  segmentNumber: number;
  // Changes on every request, so the same segment can be shown again.
  request: number;
  // Words to mark inside the segment's text, as positions in it, such as an Evidence search match.
  marks?: Highlight[];
}

interface TranscriptPanelProps {
  interviews: Interview[];
  selectedInterviewId: string | null;
  // The segment an AI Note's quote points to, scrolled into view and highlighted.
  highlight: SegmentHighlight | undefined;
  // Called after a Transcript is imported or its speakers are confirmed.
  onChanged: () => void;
}

// The Transcript panel. A Transcript belongs to one Interview, so it shows the selected
// Interview's Transcript, or asks the Interviewer to select one.
export function TranscriptPanel({ interviews, selectedInterviewId, highlight, onChanged }: TranscriptPanelProps) {
  const { text } = useText();
  const t = text.panels.transcript;
  const selected = interviews.find((interview) => interview.id === selectedInterviewId);
  if (interviews.length === 0) return <p className="empty">{t.noInterview}</p>;
  if (!selected) return <p className="empty">{t.selectInterview}</p>;
  // The key starts each Interview with a fresh state, so nothing of another Interview shows.
  return (
    <InterviewTranscript
      key={selected.id}
      interview={selected}
      highlight={highlight?.interviewId === selected.id ? highlight : undefined}
      onChanged={onChanged}
    />
  );
}

function InterviewTranscript({
  interview,
  highlight,
  onChanged,
}: {
  interview: Interview;
  highlight: SegmentHighlight | undefined;
  onChanged: () => void;
}) {
  const { text } = useText();
  const t = text.panels.transcript;
  // undefined while loading, null when the Interview has no Transcript.
  const [transcript, setTranscript] = useState<Transcript | null | undefined>();
  const [formats, setFormats] = useState<TranscriptFormat[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<unknown>();
  // A file chosen to replace the current Transcript, waiting for the Interviewer to confirm.
  const [replacement, setReplacement] = useState<File | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const segmentList = useRef<HTMLOListElement>(null);

  useEffect(() => {
    api.getTranscript(interview.id).then(setTranscript, () => setLoadFailed(true));
    api.listTranscriptFormats().then(setFormats, () => setLoadFailed(true));
  }, [interview.id]);

  // Scrolls the highlighted segment into view once it is on screen.
  const highlighted = highlight?.segmentNumber;
  useEffect(() => {
    if (highlighted === undefined || !transcript) return;
    segmentList.current
      ?.querySelector(`[data-segment="${highlighted}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted, highlight?.request, transcript]);

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still counts as a choice.
    event.target.value = "";
    if (!file) return;
    if (transcript) setReplacement(file);
    else void importFile(file);
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportError(undefined);
    try {
      setTranscript(await api.importTranscript(interview.id, file));
      onChanged();
    } catch (error) {
      setImportError(error);
    } finally {
      setImporting(false);
    }
  }

  const chooseFile = () => fileInput.current?.click();
  const guideLink = (
    <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(openTranscriptGuide))}>
      {text.transcriptGuide.open}
    </button>
  );
  // Core decides what is accepted; the file box only suggests the files it can read.
  const accept = formats.flatMap((format) => format.extensions).join(",");
  const labels = new Map(transcript?.speakers.map((speaker) => [speaker.id, speaker]));

  return (
    <div className="transcript">
      <input ref={fileInput} type="file" accept={accept} hidden onChange={handleFileChosen} />
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {transcript === null && !importing && (
        <div className="transcript-empty">
          <p className="empty">{t.empty}</p>
          <AddButton onClick={chooseFile}>{t.import}</AddButton>
          {formats.length > 0 && <p className="hint">{fill(t.supported, { formats: formatNames(text, formats) })}</p>}
          {guideLink}
        </div>
      )}
      {importing && <p className="empty">{t.importing}</p>}
      {importError !== undefined && <p className="error">{transcriptRefusalMessage(text, formats, importError)}</p>}
      {transcript && (
        <>
          <div className="transcript-file">
            <span className="transcript-file-name" title={transcript.fileName}>
              {transcript.fileName}
            </span>
            <button type="button" className="quiet" onClick={chooseFile} disabled={importing}>
              {t.replace}
            </button>
            {guideLink}
          </div>
          {/* Keyed by import, so a replaced Transcript never keeps roles chosen for the old speakers. */}
          <SpeakerMapping
            key={transcript.importedAt}
            transcript={transcript}
            onConfirmed={(updated) => {
              setTranscript(updated);
              onChanged();
            }}
          />
          <ol className="segments" ref={segmentList}>
            {transcript.segments.map((segment) => {
              const speaker = labels.get(segment.speakerId);
              return (
                <li
                  key={segment.number}
                  data-segment={segment.number}
                  className={segment.number === highlighted ? "segment highlighted" : "segment"}
                >
                  <div className="segment-head">
                    {segment.startMs === null ? (
                      <span className="segment-time missing" title={t.noTimeDetail}>
                        {t.noTime}
                      </span>
                    ) : (
                      <span className="segment-time">{formatTime(segment.startMs)}</span>
                    )}
                    <span className="segment-speaker">{speaker?.label}</span>
                    {speaker?.verified && speaker.role ? (
                      <span className="speaker-role">{t.speakers.roles[speaker.role]}</span>
                    ) : (
                      speaker && <span className="unverified">{t.unverified}</span>
                    )}
                  </div>
                  <p className="segment-text">
                    {segment.number === highlighted && highlight?.marks ? (
                      <MarkedText text={segment.text} highlights={highlight.marks} />
                    ) : (
                      segment.text
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {replacement && (
        <ConfirmDialog
          title={t.confirmReplace}
          confirmLabel={t.replaceConfirm}
          cancelLabel={t.cancel}
          onCancel={() => setReplacement(undefined)}
          onConfirm={() => {
            setReplacement(undefined);
            void importFile(replacement);
          }}
        >
          <p>
            {fill(t.confirmReplaceDetail, {
              interview: interviewName(text, interview),
              current: transcript?.fileName ?? "",
              new: replacement.name,
            })}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
