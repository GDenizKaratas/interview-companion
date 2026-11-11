import { useImperativeHandle, useRef, useState, type ChangeEvent, type Ref } from "react";
import { api, ApiError, type CandidateImport, type ExistingCandidate } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { interviewNameOf } from "./interview-names.ts";
import type { Text } from "./languages.ts";
import { ModalDialog } from "./ModalDialog.tsx";
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

// Importing a Candidate export on the Candidate list: choose the file, decide what happens to a
// Candidate who is already here, and see what was not saved before opening the Workspace. It
// has no button of its own; the page opens its file chooser through the ref.
export interface ImportCandidateHandle {
  chooseFile: () => void;
}

export function ImportCandidate({ ref }: { ref: Ref<ImportCandidateHandle> }) {
  const { text } = useText();
  const t = text.importCandidate;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<Step>({ step: "idle" });

  useImperativeHandle(ref, () => ({ chooseFile: () => input.current?.click() }), []);

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
      {state.step === "importing" && (
        <p className="muted" role="status">
          {t.importing}
        </p>
      )}
      {state.step === "failed" && (
        <ModalDialog
          title={t.failedTitle}
          kind="info"
          onCancel={() => setState({ step: "idle" })}
          actions={
            <button type="button" autoFocus onClick={() => setState({ step: "idle" })}>
              {t.close}
            </button>
          }
        >
          <p role="alert">{failureMessage(text, state.error)}</p>
        </ModalDialog>
      )}
      {state.step === "exists" && (
        <ConfirmDialog
          title={t.exists.title}
          confirmLabel={t.exists.replace}
          cancelLabel={t.exists.cancel}
          otherAction={{ label: t.exists.keepBoth, onClick: () => void importFile(state.file, "keepBoth") }}
          onConfirm={() => void importFile(state.file, "replace")}
          onCancel={() => setState({ step: "idle" })}
        >
          <p>{t.exists.detail}</p>
        </ConfirmDialog>
      )}
      {state.step === "report" && (
        <ModalDialog
          title={t.report.title}
          kind="info"
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
        </ModalDialog>
      )}
    </>
  );
}

function failureMessage(text: Text, error: unknown): string {
  const t = text.importCandidate;
  if (error instanceof ApiError && error.field === "candidateExportVersion") return t.newerVersion;
  if (error instanceof ApiError && error.field === "candidateExport") return t.notAnExport;
  return t.failed;
}
