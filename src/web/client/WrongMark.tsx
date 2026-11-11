import { useState } from "react";
import { api, type AskedQuestion } from "./api.ts";
import { useText } from "./text.tsx";

// The Interviewer's mark that an Asked Question's summary is wrong. Unmarked, it is a quiet "!"
// button; marked, a warning label and the action that takes the mark back. One click either way,
// so it never asks first. Core saves the mark and decides what it means.
export function WrongMark({
  askedQuestion,
  onChange,
  withWords = false,
}: {
  askedQuestion: AskedQuestion;
  onChange: (updated: AskedQuestion) => void;
  // Beside the summary itself, the button says what it does in words; in a list row the icon is enough.
  withWords?: boolean;
}) {
  const { text } = useText();
  const t = text.panels.askedQuestions;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function mark(wrong: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      onChange(await api.markAskedQuestionWrong(askedQuestion.id, wrong));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="wrong-mark">
      {askedQuestion.markedWrong ? (
        <>
          <span className="wrong-label" title={t.markedWrongHint}>
            {t.markedWrong}
          </span>
          <button type="button" className="link-button" disabled={busy} onClick={() => void mark(false)}>
            {t.notWrong}
          </button>
        </>
      ) : (
        <button
          type="button"
          className={withWords ? "quiet wrong-mark-button with-words" : "icon-button wrong-mark-button"}
          title={t.markWrong}
          aria-label={t.markWrong}
          disabled={busy}
          onClick={() => void mark(true)}
        >
          <span className="wrong-mark-icon" aria-hidden="true">
            !
          </span>
          {withWords && t.summaryIsWrong}
        </button>
      )}
      {failed && (
        <span className="error" role="alert">
          {t.markFailed}
        </span>
      )}
    </span>
  );
}
