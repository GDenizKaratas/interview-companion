import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { api, ApiError, type CandidateImport, type ExistingCandidate } from "./api.ts";
import { interviewNameOf } from "./interview-names.ts";
import type { Text } from "./languages.ts";
import { candidatePath, navigate } from "./navigation.ts";
import { useText } from "./text.tsx";

type Step =
  | { step: "idle" }
  | { step: "importing" }
  // The Candidate in the zip is already in the app: the Interviewer chooses before anything changes.
  | { step: "exists"; file: File }
  // Imported, with things that were not saved.
  | { step: "report"; result: CandidateImport }
  | { step: "failed"; error: unknown };

// The Candidate list's Import button: choose a Candidate export, decide what happens to a
// Candidate who is already here, and see what was not saved before opening the Workspace.
export function ImportCandidate() {
  const { text } = useText();
  const t = text.importCandidate;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<Step>({ step: "idle" });

  async function importFile(file: File, ifExists?: ExistingCandidate) {
    setState({ step: "importing" });
    try {
      const result = await api.importCandidate(file, ifExists);
      if (result.problems.length === 0) navigate(candidatePath(result.candidate.id));
      else setState({ step: "report", result });
    } catch (error) {
      if (error instanceof ApiError && error.reason === "candidateExists") setState({ step: "exists", file });
      else setState({ step: "failed", error });
    }
  }

  function handleChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be chosen again after a refusal.
    event.target.value = "";
    if (file) void importFile(file);
  }

  return (
    <>
      <input ref={input} type="file" accept="application/zip,.zip" hidden onChange={handleChosen} />
      <button type="button" className="quiet" disabled={state.step === "importing"} onClick={() => input.current?.click()}>
        {state.step === "importing" ? t.importing : t.open}
      </button>
      {state.step === "failed" && (
        <Modal
          title={t.failedTitle}
          onCancel={() => setState({ step: "idle" })}
          actions={
            <button type="button" autoFocus onClick={() => setState({ step: "idle" })}>
              {t.close}
            </button>
          }
        >
          <p role="alert">{failureMessage(text, state.error)}</p>
        </Modal>
      )}
      {state.step === "exists" && (
        <Modal
          title={t.exists.title}
          onCancel={() => setState({ step: "idle" })}
          actions={
            <>
              <button type="button" className="quiet" autoFocus onClick={() => setState({ step: "idle" })}>
                {t.exists.cancel}
              </button>
              <button type="button" className="secondary" onClick={() => void importFile(state.file, "keepBoth")}>
                {t.exists.keepBoth}
              </button>
              <button type="button" className="danger" onClick={() => void importFile(state.file, "replace")}>
                {t.exists.replace}
              </button>
            </>
          }
        >
          <p>{t.exists.detail}</p>
        </Modal>
      )}
      {state.step === "report" && (
        <Modal
          title={t.report.title}
          onCancel={() => navigate(candidatePath(state.result.candidate.id))}
          actions={
            <button type="button" autoFocus onClick={() => navigate(candidatePath(state.result.candidate.id))}>
              {t.report.open}
            </button>
          }
        >
          <p>
            <strong>{state.result.candidate.name}</strong> · {state.result.candidate.role}
          </p>
          <p>{t.report.detail}</p>
          <ul className="import-problems">
            {state.result.problems.map((problem, i) => (
              <li key={i}>
                <span className="import-problem-kind">
                  {t.report.kinds[problem.kind]}
                  {problem.interviewNumber !== null && ` · ${interviewNameOf(text, problem.interviewNumber)}`}
                </span>
                <span className="import-problem-text">{problem.text}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, children, actions, onCancel }: { title: string; children: ReactNode; actions: ReactNode; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="import-candidate-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="import-candidate-title">{title}</h2>
      <div className="confirm-dialog-subject">{children}</div>
      <div className="confirm-dialog-actions">{actions}</div>
    </dialog>
  );
}

function failureMessage(text: Text, error: unknown): string {
  const t = text.importCandidate;
  if (error instanceof ApiError && error.field === "candidateExportVersion") return t.newerVersion;
  if (error instanceof ApiError && error.field === "candidateExport") return t.notAnExport;
  return t.failed;
}
