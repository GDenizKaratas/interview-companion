import { useState } from "react";
import { api, type AskedQuestion } from "./api.ts";
import { useText } from "./text.tsx";

// The Interviewer's mark that an Asked Question's summary is wrong. Unmarked, it is a quiet "!"
// button; marked, a warning label and the action that takes the mark back. One click either way,
// so it never asks first. Core saves the mark and decides what it means.
export function WrongMark({ askedQuestion, onChange }: { askedQuestion: AskedQuestion; onChange: (updated: AskedQuestion) => void }) {
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
          <span className="wrong-label">{t.markedWrong}</span>
          <button type="button" className="link-button" disabled={busy} onClick={() => void mark(false)}>
            {t.notWrong}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="icon-button wrong-mark-button"
          title={t.markWrong}
          aria-label={t.markWrong}
          disabled={busy}
          onClick={() => void mark(true)}
        >
          <span className="wrong-mark-icon" aria-hidden="true">
            !
          </span>
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
