import { useEffect, useRef, useState } from "react";
import { api, type AskedQuestion, type Highlight, type Transcript } from "./api.ts";
import { MarkedText } from "./MarkedText.tsx";
import { formatTime } from "./transcript-text.ts";
import { useText } from "./text.tsx";
import { WrongMark } from "./WrongMark.tsx";

// How many segments before and after the exchange are shown, dimmed, for context.
const contextSegments = 1;

// One Asked Question's exchange, cut out of the Transcript: the question, the Answer Summary,
// and the segments from the question to the end of the answer, with the quoted words marked.
// The segments around it are dimmed. Escape, the close button, or a click outside closes it.
// Next to the summary, the Interviewer can mark it as wrong, or take the mark back.
export function ExchangeDialog({
  askedQuestion,
  onMarkChange,
  onOpenInTranscript,
  onClose,
}: {
  askedQuestion: AskedQuestion;
  // Called with the Asked Question as core gives it after its mark changed.
  onMarkChange: (updated: AskedQuestion) => void;
  // Shows the whole Transcript at the question.
  onOpenInTranscript: () => void;
  onClose: () => void;
}) {
  const { text } = useText();
  const t = text.panels.exchange;
  const dialog = useRef<HTMLDialogElement>(null);
  const [transcript, setTranscript] = useState<Transcript | null | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    api.getTranscript(askedQuestion.interviewId).then(setTranscript, () => setLoadFailed(true));
  }, [askedQuestion.interviewId]);

  const { firstSegment, lastSegment } = askedQuestion;
  const shown = transcript?.segments.filter(
    (segment) => segment.number >= firstSegment - contextSegments && segment.number <= lastSegment + contextSegments,
  );
  const speakers = new Map(transcript?.speakers.map((speaker) => [speaker.id, speaker]));
  const quotes = [askedQuestion.questionEvidence, ...askedQuestion.answerEvidence];

  return (
    <dialog
      ref={dialog}
      className="cv-preview-dialog exchange-dialog"
      aria-labelledby="exchange-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      <header className="panel-head">
        <h2 id="exchange-title">{askedQuestion.question}</h2>
        <button type="button" className="icon-button" aria-label={t.close} title={t.close} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="panel-body">
        <div className="exchange">
          <div className={askedQuestion.markedWrong ? "exchange-summary wrong" : "exchange-summary"}>
            <div className="exchange-summary-head">
              <span className="exchange-summary-label">{t.answer}</span>
              <WrongMark askedQuestion={askedQuestion} onChange={onMarkChange} />
            </div>
            <p className="exchange-summary-text">{askedQuestion.answerSummary}</p>
          </div>
          {loadFailed && <p className="error">{t.loadFailed}</p>}
          {shown && (
            <ol className="segments exchange-segments">
              {shown.map((segment) => {
                const speaker = speakers.get(segment.speakerId);
                const inside = segment.number >= firstSegment && segment.number <= lastSegment;
                const marks = quotes
                  .filter((quote) => quote.segmentNumber === segment.number)
                  .flatMap((quote): Highlight[] => {
                    const start = segment.text.indexOf(quote.quote);
                    return start < 0 ? [] : [{ start, end: start + quote.quote.length }];
                  });
                return (
                  <li key={segment.number} className={inside ? "segment exchange-part" : "segment exchange-context"}>
                    <div className="segment-head">
                      {segment.startMs !== null && <span className="segment-time">{formatTime(segment.startMs)}</span>}
                      <span className="segment-speaker">{speaker?.label}</span>
                      {speaker?.role && <span className="speaker-role">{text.panels.transcript.speakers.roles[speaker.role]}</span>}
                    </div>
                    <p className="segment-text">
                      <MarkedText text={segment.text} highlights={marks} />
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              onOpenInTranscript();
              onClose();
            }}
          >
            {t.openInTranscript}
          </button>
        </div>
      </div>
    </dialog>
  );
}
