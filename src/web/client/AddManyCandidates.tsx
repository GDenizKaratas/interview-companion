import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type CandidateCvCheck, type InputRule } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { fill, type Text } from "./languages.ts";
import { pdfsOfFolder, readDrop, type PickedFiles } from "./picked-files.ts";
import { refusalText } from "./refusal-text.ts";
import { useText } from "./text.tsx";

// How many CVs are checked at the same time, so the page and the server stay responsive.
const checksAtOnce = 4;
// How long after the last key press a changed name or role is checked again.
const recheckDelay = 500;

interface CvRow {
  key: number;
  file: File;
  // The name as shown in the row's field: the one core read, until the Interviewer edits it.
  name: string;
  nameEdited: boolean;
  // Core's answer for this file, or undefined until the first one arrives.
  check: CandidateCvCheck | undefined;
  // The row waits for a check (again): it is new, or its name or the role changed. It counts as
  // being checked at once, so nothing is added from an answer to the old name or role.
  pending: boolean;
  // A changed name or role is sent only when typing pauses; until then the check is held back.
  holding: boolean;
  // Raised on each change that needs a new check, so an answer to an older one is ignored.
  version: number;
  checkFailed: boolean;
  // For a Candidate already in the app: the Interviewer chose to add them anyway.
  addAnyway: boolean;
}

type RowStatus =
  | { kind: "checking" }
  | { kind: "checkFailed" }
  | { kind: "refused"; rule: InputRule }
  | { kind: "needsName" }
  | { kind: "alreadyAdded" }
  | { kind: "ready" };

// The outcome of adding one file: added, or the refusal from the server.
type Outcome = { added: true } | { added: false; error: unknown };

type Phase =
  | { kind: "choosing" }
  | { kind: "adding"; done: number; total: number }
  | { kind: "finished"; outcomes: Map<number, Outcome>; stopped: boolean };

// Every judgement comes from core's check: the browser only shows the status core gave.
function statusOf(row: CvRow): RowStatus {
  if (row.check === undefined) return row.checkFailed ? { kind: "checkFailed" } : { kind: "checking" };
  const { status, refusal } = row.check;
  return status === "refused" ? { kind: "refused", rule: refusal ?? "format" } : { kind: status };
}

function newRow(key: number, file: File): CvRow {
  return {
    key,
    file,
    name: "",
    nameEdited: false,
    check: undefined,
    pending: true,
    holding: false,
    version: 0,
    checkFailed: false,
    addAnyway: false,
  };
}

function willBeAdded(row: CvRow): boolean {
  const status = statusOf(row).kind;
  return status === "ready" || (status === "alreadyAdded" && row.addAnyway);
}

// "Add many from CVs" in the Add Candidate dialog: the role is chosen once, many PDFs are dropped
// or chosen, core checks each one, and the ready ones are added one at a time. Returns the
// dialog's content and buttons, since the dialog around it is shared with the one-Candidate form.
export function useAddManyCandidates({
  role,
  roleField,
  shown,
  initialFiles,
  onRunAdded,
  onAdded,
  onClose,
}: {
  role: string;
  roleField: ReactNode;
  // Whether this way is the one shown in the dialog.
  shown: boolean;
  // Files the dialog opens with, such as PDFs dropped on the Candidate list.
  initialFiles?: PickedFiles;
  // A run of adding ended having added at least one Candidate; the dialog stays open on the report.
  onRunAdded: () => void;
  // At least one Candidate was added; the dialog closes and the list shows them. With a role, the
  // Interviewer asked to see that role's Candidates.
  onAdded: (show?: { role: string }) => void;
  onClose: () => void;
}) {
  const { text } = useText();
  const t = text.candidates.many;
  const [rows, setRows] = useState<CvRow[]>(() => (initialFiles?.files ?? []).map((file, i) => newRow(i, file)));
  const [ignored, setIgnored] = useState(initialFiles?.ignored ?? 0);
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });
  const [dragging, setDragging] = useState(false);
  const [stopping, setStopping] = useState(false);
  // Which question is open over the dialog: stop adding, or close and lose the list.
  const [confirming, setConfirming] = useState<"stop" | "discard" | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const nextKey = useRef(initialFiles?.files.length ?? 0);
  const inFlight = useRef(new Map<number, AbortController>());
  const nameTimers = useRef(new Map<number, number>());
  const roleRef = useRef(role);
  const stopRequested = useRef(false);
  const closeWhenStopped = useRef(false);
  // Whether any run of adding, before a fix of the files not added, added a Candidate. Closing
  // then shows the Candidate list again with them.
  const addedAny = useRef(false);
  // The role as core saved it for the Candidates added, for "Show these Candidates". Once set, the
  // role field is locked, so a fix of the files not added adds to the same role and the button
  // shows every Candidate this dialog added.
  const [addedRole, setAddedRole] = useState<string | undefined>();
  // Raised when a check ends without changing the rows, so the next waiting row starts.
  const [checksEnded, setChecksEnded] = useState(0);

  // A changed role changes which Candidates are already in the app, so every CV is checked again.
  // The rows count as being checked at once; the check is sent once typing pauses.
  useEffect(() => {
    if (roleRef.current === role) return;
    roleRef.current = role;
    for (const controller of inFlight.current.values()) controller.abort();
    setRows((current) => current.map((row) => ({ ...row, pending: true, holding: true, version: row.version + 1 })));
    const timer = window.setTimeout(() => {
      setRows((current) => current.map((row) => (row.holding ? { ...row, holding: false } : row)));
    }, recheckDelay);
    return () => window.clearTimeout(timer);
  }, [role]);

  // Starts checks for waiting rows, a few at a time.
  useEffect(() => {
    for (const row of rows) {
      if (inFlight.current.size >= checksAtOnce) break;
      if (!row.pending || row.holding || inFlight.current.has(row.key)) continue;
      const controller = new AbortController();
      inFlight.current.set(row.key, controller);
      const { key, version } = row;
      api
        .checkCandidateCv(roleRef.current, row.file, row.nameEdited ? row.name : undefined, controller.signal)
        .then(
          (check) =>
            setRows((current) =>
              current.map((r) =>
                r.key === key && r.version === version
                  ? { ...r, check, pending: false, checkFailed: false, name: r.nameEdited ? r.name : check.name }
                  : r,
              ),
            ),
          () => {
            if (controller.signal.aborted) return;
            setRows((current) =>
              current.map((r) => (r.key === key && r.version === version ? { ...r, pending: false, checkFailed: true } : r)),
            );
          },
        )
        .finally(() => {
          inFlight.current.delete(key);
          setChecksEnded((n) => n + 1);
        });
    }
  }, [rows, checksEnded]);

  // Stops every check when the dialog closes.
  useEffect(() => {
    const checks = inFlight.current;
    const timers = nameTimers.current;
    return () => {
      for (const controller of checks.values()) controller.abort();
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  // While this way is shown, a CV dropped beside the drop area must not open in the browser tab,
  // which would lose the list. The one-Candidate form keeps the browser's own dragging.
  useEffect(() => {
    if (!shown) return;
    const keepFile = (event: globalThis.DragEvent) => event.preventDefault();
    window.addEventListener("dragover", keepFile);
    window.addEventListener("drop", keepFile);
    return () => {
      window.removeEventListener("dragover", keepFile);
      window.removeEventListener("drop", keepFile);
    };
  }, [shown]);

  function addFiles(files: File[], ignoredFiles = 0) {
    if (ignoredFiles > 0) setIgnored((n) => n + ignoredFiles);
    if (files.length === 0) return;
    const added = files.map((file) => newRow(nextKey.current++, file));
    setRows((current) => [...current, ...added]);
  }

  function changeName(key: number, name: string) {
    inFlight.current.get(key)?.abort();
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, name, nameEdited: true, pending: true, holding: true, version: row.version + 1 } : row,
      ),
    );
    window.clearTimeout(nameTimers.current.get(key));
    nameTimers.current.set(
      key,
      window.setTimeout(() => {
        nameTimers.current.delete(key);
        setRows((current) => current.map((row) => (row.key === key ? { ...row, holding: false } : row)));
      }, recheckDelay),
    );
  }

  function setAddAnyway(keys: number[], addAnyway: boolean) {
    setRows((current) => current.map((row) => (keys.includes(row.key) ? { ...row, addAnyway } : row)));
  }

  function removeRow(key: number) {
    inFlight.current.get(key)?.abort();
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (phase.kind !== "choosing") return;
    readDrop(event.dataTransfer).then(({ files, ignored: left }) => addFiles(files, left));
  }

  // Adds the ready files one at a time, so one refused file does not stop the others and the
  // progress is real. Core checks each again when it is saved.
  async function addAll() {
    const toAdd = rows.filter(willBeAdded);
    const outcomes = new Map<number, Outcome>();
    let addedThisRun = false;
    stopRequested.current = false;
    setStopping(false);
    setPhase({ kind: "adding", done: 0, total: toAdd.length });
    for (const [i, row] of toAdd.entries()) {
      if (stopRequested.current) break;
      try {
        const candidate = await api.createCandidateWithCv({ name: row.name, role }, row.file, { onlyIfNew: !row.addAnyway });
        outcomes.set(row.key, { added: true });
        setAddedRole(candidate.role);
        addedAny.current = true;
        addedThisRun = true;
      } catch (error) {
        outcomes.set(row.key, { added: false, error });
      }
      setPhase({ kind: "adding", done: i + 1, total: toAdd.length });
    }
    if (addedThisRun) onRunAdded();
    if (closeWhenStopped.current) {
      close();
      return;
    }
    setPhase({ kind: "finished", outcomes, stopped: stopRequested.current });
  }

  // Back from the report to the list, with only the files that were not added, checked again.
  // Names typed and choices made on them are kept.
  function fixNotAdded() {
    if (phase.kind !== "finished") return;
    const { outcomes } = phase;
    setRows((current) =>
      current
        .filter((row) => !outcomes.get(row.key)?.added)
        .map((row) => ({ ...row, pending: true, holding: false, checkFailed: false, version: row.version + 1 })),
    );
    setIgnored(0);
    setStopping(false);
    setPhase({ kind: "choosing" });
  }

  // Closes the dialog; when anything was added in any run, the Candidate list is loaded again.
  function close() {
    if (addedAny.current) onAdded();
    else onClose();
  }

  function stop() {
    stopRequested.current = true;
    setStopping(true);
  }

  // Escape, the × button, or Cancel. While files are being added, or while a list waits to be
  // added, the Interviewer is asked first.
  function requestClose() {
    if (phase.kind === "adding") setConfirming("stop");
    else if (phase.kind === "choosing" && rows.length > 0) setConfirming("discard");
    else close();
  }

  // Stop and close: the file being added is finished first. If adding ended while the question
  // was open, there is nothing left to stop.
  function confirmStop() {
    setConfirming(undefined);
    if (phase.kind !== "adding") {
      close();
      return;
    }
    closeWhenStopped.current = true;
    stop();
  }

  const confirmDialog =
    confirming === "stop" ? (
      <ConfirmDialog
        title={t.confirmClose.title}
        confirmLabel={t.confirmClose.stop}
        cancelLabel={t.confirmClose.keepGoing}
        onConfirm={confirmStop}
        onCancel={() => setConfirming(undefined)}
      >
        <p>{t.confirmClose.detail}</p>
      </ConfirmDialog>
    ) : confirming === "discard" ? (
      <ConfirmDialog
        title={t.confirmDiscard.title}
        confirmLabel={t.confirmDiscard.close}
        cancelLabel={t.confirmDiscard.keep}
        onConfirm={() => {
          setConfirming(undefined);
          close();
        }}
        onCancel={() => setConfirming(undefined)}
      >
        <p>{t.confirmDiscard.detail}</p>
      </ConfirmDialog>
    ) : null;

  const statuses = rows.map(statusOf);
  const count = (kind: RowStatus["kind"]) => statuses.filter((status) => status.kind === kind).length;
  const duplicates = rows.filter((row, i) => statuses[i]!.kind === "alreadyAdded");
  const readyCount = rows.filter(willBeAdded).length;
  const checking = rows.filter((row) => row.pending).length;
  const roleMissing = role.trim() === "";

  const summary = [
    fill(t.summary.ready, { count: String(readyCount) }),
    count("needsName") > 0 ? counted(t.summary.needName, t.summary.needNameOne, count("needsName")) : null,
    count("refused") + count("checkFailed") > 0 ? fill(t.summary.cannot, { count: String(count("refused") + count("checkFailed")) }) : null,
    duplicates.length > 0 ? fill(t.summary.alreadyAdded, { count: String(duplicates.length) }) : null,
    ignored > 0 ? counted(t.summary.ignored, t.summary.ignoredOne, ignored) : null,
  ].filter((part) => part !== null);

  const content =
    phase.kind === "finished" ? (
      <FinishedReport text={text} rows={rows} outcomes={phase.outcomes} stopped={phase.stopped} />
    ) : (
      <div
        className={dragging ? "add-many dragging" : "add-many"}
        onDragOver={(event) => {
          event.preventDefault();
          if (phase.kind === "choosing") setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <fieldset className="candidate-form" disabled={phase.kind === "adding" || addedRole !== undefined}>
          {roleField}
          {addedRole !== undefined && <p className="form-hint">{t.roleKept}</p>}
        </fieldset>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        {/* The browser marks a folder chooser with its own attribute, which React does not know. */}
        <input
          ref={(input) => {
            folderInput.current = input;
            if (input) input.webkitdirectory = true;
          }}
          type="file"
          hidden
          onChange={(event) => {
            const { files, ignored: left } = pdfsOfFolder(event.target.files ?? []);
            addFiles(files, left);
            event.target.value = "";
          }}
        />
        {phase.kind === "choosing" && (
          <div className={rows.length === 0 ? "add-many-choose" : "add-many-choose compact"}>
            <button
              type="button"
              className={rows.length === 0 ? "cv-drop" : "cv-drop compact"}
              onClick={() => fileInput.current?.click()}
            >
              <span className="cv-drop-title">{rows.length === 0 ? t.drop : t.dropMore}</span>
              {rows.length === 0 && <span className="cv-drop-detail">{t.dropDetail}</span>}
            </button>
            <button type="button" className="link-button add-many-folder" onClick={() => folderInput.current?.click()}>
              {t.chooseFolder}
            </button>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <p className="add-many-summary" aria-live="polite">
              {roleMissing ? (
                <span className="add-many-role-missing">{t.chooseRole}</span>
              ) : (
                summary.join(" · ")
              )}
              {checking > 0 && <span className="add-many-checking"> · {fill(t.summary.checking, { count: String(checking) })}</span>}
              {duplicates.length > 0 && phase.kind === "choosing" && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    const allAnyway = duplicates.every((row) => row.addAnyway);
                    setAddAnyway(duplicates.map((row) => row.key), !allAnyway);
                  }}
                >
                  {duplicates.every((row) => row.addAnyway) ? t.skipAll : t.addAllAnyway}
                </button>
              )}
            </p>
            <ul className="add-many-rows">
              {/* What needs the Interviewer comes first, so nothing waits unseen below a hundred ready rows. */}
              {attentionFirst(rows, statuses).map(({ row, status }) => (
                <CvRowItem
                  key={row.key}
                  text={text}
                  row={row}
                  status={status}
                  locked={phase.kind !== "choosing"}
                  onName={(name) => changeName(row.key, name)}
                  onAddAnyway={(addAnyway) => setAddAnyway([row.key], addAnyway)}
                  onRemove={() => removeRow(row.key)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    );

  const notAddedCount = phase.kind === "finished" ? rows.filter((row) => !phase.outcomes.get(row.key)?.added).length : 0;

  const actions =
    phase.kind === "finished" ? (
      <>
        {notAddedCount > 0 && (
          <button type="button" className="secondary" onClick={fixNotAdded}>
            {t.fixNotAdded}
          </button>
        )}
        <button type="button" className={addedRole === undefined ? undefined : "secondary"} onClick={requestClose}>
          {t.close}
        </button>
        {addedRole !== undefined && (
          <button type="button" onClick={() => onAdded({ role: addedRole })}>
            {t.showThese}
          </button>
        )}
      </>
    ) : phase.kind === "adding" ? (
      <>
        <span className="add-many-progress" aria-live="polite">
          {stopping ? t.stopping : fill(t.progress, { done: String(phase.done), total: String(phase.total) })}
        </span>
        <button type="button" className="secondary" onClick={stop} disabled={stopping}>
          {t.stop}
        </button>
      </>
    ) : (
      <>
        <button type="button" className="secondary" onClick={requestClose}>
          {text.candidates.cancel}
        </button>
        <AddButton type="button" disabled={readyCount === 0 || roleMissing || checking > 0} onClick={addAll}>
          {readyCount === 0 ? t.addNone : counted(t.addCount, t.addOne, readyCount)}
        </AddButton>
      </>
    );

  return {
    content,
    actions,
    confirmDialog,
    requestClose,
    // Closes without asking, as the one-Candidate form does, still showing what any run added.
    close,
    addFiles,
    // While adding, once the report is shown, or once anyone was added, the way cannot be changed:
    // the files not added are fixed here, under the same role.
    locked: phase.kind !== "choosing" || addedRole !== undefined,
  };
}

// The rows in the order they are shown: those the Interviewer must name, then those already in
// the app, then those that cannot be added, then the ready ones. Within each group the order of
// the files is kept.
function attentionFirst<Row, Status extends { kind: string }>(rows: Row[], statuses: Status[]): { row: Row; status: Status }[] {
  const rank = (kind: string) => (kind === "needsName" ? 0 : kind === "alreadyAdded" ? 1 : kind === "refused" || kind === "checkFailed" ? 2 : 3);
  return rows
    .map((row, i) => ({ row, status: statuses[i]!, place: i }))
    .sort((a, b) => rank(a.status.kind) - rank(b.status.kind) || a.place - b.place);
}

function CvRowItem({
  text,
  row,
  status,
  locked,
  onName,
  onAddAnyway,
  onRemove,
}: {
  text: Text;
  row: CvRow;
  status: RowStatus;
  locked: boolean;
  onName: (name: string) => void;
  onAddAnyway: (addAnyway: boolean) => void;
  onRemove: () => void;
}) {
  const t = text.candidates.many;
  const refused = status.kind === "refused" || status.kind === "checkFailed";
  return (
    <li className={`add-many-row ${status.kind}`}>
      <span className="add-many-file" title={row.file.name}>
        {row.file.name}
      </span>
      {refused ? (
        <span className="add-many-reason">{status.kind === "refused" ? refusalReason(text, status.rule) : t.checkFailed}</span>
      ) : (
        <input
          className="add-many-name"
          value={row.name}
          placeholder={status.kind === "checking" ? t.checking : t.typeName}
          aria-label={fill(t.nameFor, { file: row.file.name })}
          disabled={locked}
          onChange={(event) => onName(event.target.value)}
        />
      )}
      <span className="add-many-state">
        {status.kind === "ready" && <span className="add-many-ready">{t.ready}</span>}
        {status.kind === "needsName" && <span className="add-many-warn">{t.needsName}</span>}
        {status.kind === "checking" && <span className="add-many-muted">{t.checking}</span>}
        {refused && <span className="add-many-bad">{t.cannotAdd}</span>}
        {status.kind === "alreadyAdded" && (
          <span className="add-many-duplicate">
            <span className="add-many-warn">{t.alreadyAdded}</span>
            <span className="role-choices">
              <button
                type="button"
                className={row.addAnyway ? "role-choice" : "role-choice chosen"}
                aria-pressed={!row.addAnyway}
                disabled={locked}
                onClick={() => onAddAnyway(false)}
              >
                {t.skip}
              </button>
              <button
                type="button"
                className={row.addAnyway ? "role-choice chosen" : "role-choice"}
                aria-pressed={row.addAnyway}
                disabled={locked}
                onClick={() => onAddAnyway(true)}
              >
                {t.addAnyway}
              </button>
            </span>
          </span>
        )}
      </span>
      {!locked && (
        <button type="button" className="icon-button add-many-remove" aria-label={t.remove} title={t.remove} onClick={onRemove}>
          ×
        </button>
      )}
    </li>
  );
}

// After adding: how many were added, and every file that was not, with its reason.
function FinishedReport({
  text,
  rows,
  outcomes,
  stopped,
}: {
  text: Text;
  rows: CvRow[];
  outcomes: Map<number, Outcome>;
  stopped: boolean;
}) {
  const t = text.candidates.many;
  const added = [...outcomes.values()].filter((outcome) => outcome.added).length;
  const notAdded = rows
    .map((row) => ({ row, reason: notAddedReason(text, row, outcomes.get(row.key), stopped) }))
    .filter((entry): entry is { row: CvRow; reason: string } => entry.reason !== null);
  return (
    <div className="add-many-report">
      <p className="add-many-added">{added === 0 ? t.addedNone : counted(t.added, t.addedOne, added)}</p>
      {notAdded.length > 0 && (
        <>
          <p className="add-many-not-added">{fill(t.notAdded, { count: String(notAdded.length) })}</p>
          <ul className="add-many-rows">
            {notAdded.map(({ row, reason }) => (
              <li key={row.key} className="add-many-row report">
                <span className="add-many-file" title={row.file.name}>
                  {row.file.name}
                </span>
                <span className="add-many-reason">{reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Why a file was not added, or null when it was.
function notAddedReason(text: Text, row: CvRow, outcome: Outcome | undefined, stopped: boolean): string | null {
  const t = text.candidates.many;
  if (outcome?.added) return null;
  if (outcome) return saveRefusal(text, outcome.error);
  const status = statusOf(row);
  if (status.kind === "refused") return refusalReason(text, status.rule);
  if (status.kind === "checkFailed") return t.checkFailed;
  if (status.kind === "needsName") return t.needsName;
  if (status.kind === "alreadyAdded") return t.skipped;
  return stopped ? t.stopped : t.checkFailed;
}

// Core refused the file when it was saved; this says why, in the current language.
function saveRefusal(text: Text, error: unknown): string {
  const t = text.candidates.many;
  if (error instanceof ApiError) {
    if (error.reason === "candidateExists") return t.alreadyAdded;
    if (error.field === "cv" && error.rule !== undefined) return refusalReason(text, error.rule);
    if (error.rule === "required" && error.field === "name") return text.candidates.required.name;
    if (error.rule === "required" && error.field === "role") return text.candidates.required.role;
  }
  return refusalText(text, error, text.candidates.saveFailed);
}

function refusalReason(text: Text, rule: InputRule): string {
  if (rule === "readableText") return text.panels.cv.refused.readableText;
  if (rule === "format") return text.panels.cv.refused.format;
  if (rule === "required") return text.candidates.many.emptyFile;
  return text.candidates.many.checkFailed;
}

function counted(many: string, one: string, count: number): string {
  return count === 1 ? one : fill(many, { count: String(count) });
}
