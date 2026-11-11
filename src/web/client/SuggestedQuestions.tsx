import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api, ApiError, type Interview, type SuggestedQuestion, type SuggestionEvidence } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { interviewName } from "./interview-names.ts";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";

interface SuggestedQuestionsProps {
  candidateId: string;
  interviews: Interview[];
  // Changes whenever a CV is uploaded or a Transcript imported or re-mapped. A replaced source
  // removes the suggestions that quote it, and the notes about the last generation no longer
  // apply, so the list loads again and those notes are cleared.
  sourceVersion: number;
  // Called after a suggestion was copied into Saved Questions, so that list loads again.
  onAccepted: () => void;
}

// Suggested Questions, the second tab of the Questions card. The card mounts this only once the
// Interviewer opens the tab, so nothing is loaded and no model call can happen before that, and
// generation runs only on the button.
export function SuggestedQuestions({ candidateId, interviews, sourceVersion, onAccepted }: SuggestedQuestionsProps) {
  const { text } = useText();
  const t = text.panels.questions.suggestions;
  const [apiKeySaved, setApiKeySaved] = useState<boolean | undefined>();
  const [suggestions, setSuggestions] = useState<SuggestedQuestion[] | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>();
  const [dropped, setDropped] = useState(0);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [changeError, setChangeError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    const loadKey = () => api.getApiKeyStatus().then((status) => setApiKeySaved(status.saved), () => setLoadFailed(true));
    void loadKey();
    window.addEventListener(apiKeyChanged, loadKey);
    return () => window.removeEventListener(apiKeyChanged, loadKey);
  }, []);

  const reload = useCallback(
    () =>
      api.listSuggestedQuestions(candidateId).then(
        (list) => {
          setSuggestions(list);
          setLoadFailed(false);
        },
        () => setLoadFailed(true),
      ),
    [candidateId],
  );

  useEffect(() => {
    void reload().then(() => {
      setDropped(0);
      setLeftOut([]);
    });
  }, [reload, sourceVersion]);

  async function generate() {
    setConfirmingReplace(false);
    setGenerating(true);
    setGenerateError(undefined);
    setChangeError(undefined);
    setDropped(0);
    setLeftOut([]);
    try {
      const result = await api.generateSuggestedQuestions(candidateId, focus);
      setSuggestions(result.suggestions);
      setDropped(result.dropped);
      setLeftOut(result.leftOut);
    } catch (error) {
      setGenerateError(error);
    } finally {
      setGenerating(false);
    }
  }

  // Runs one change to a suggestion, then shows the list as core has it.
  async function change(run: () => Promise<unknown>): Promise<boolean> {
    setChangeError(undefined);
    setGenerateError(undefined);
    setDropped(0);
    setLeftOut([]);
    setBusy(true);
    let ok = true;
    try {
      await run();
    } catch (error) {
      ok = false;
      setChangeError(error);
    }
    await reload();
    setBusy(false);
    return ok;
  }

  async function accept(id: string) {
    if (await change(() => api.acceptSuggestedQuestion(id))) onAccepted();
  }

  // Regenerating replaces every suggestion that was not accepted, so it asks first when there are some.
  const replacedCount = suggestions?.filter((s) => !s.accepted).length ?? 0;
  const startGenerate = () => (replacedCount > 0 ? setConfirmingReplace(true) : void generate());
  const dismissedCount = suggestions?.filter((s) => s.dismissed).length ?? 0;
  const visible = suggestions?.filter((s) => showDismissed || !s.dismissed) ?? [];
  const leftOutNames = leftOut
    .map((id) => interviews.find((interview) => interview.id === id))
    .filter((interview) => interview !== undefined)
    .map((interview) => interviewName(text, interview));

  return (
    <div className="suggestions-body">
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {apiKeySaved === false && (
        <div className="ai-notes-empty">
          <p className="empty">{t.noApiKey}</p>
          <button type="button" className="quiet" onClick={() => setSettingsOpen(true)}>
            {t.addApiKey}
          </button>
        </div>
      )}
      {apiKeySaved && (
        <div className="suggestions-generate">
          <label className="suggestions-focus">
            <span>{t.focusLabel}</span>
            <input
              type="text"
              value={focus}
              placeholder={t.focusPlaceholder}
              disabled={generating}
              onChange={(e) => setFocus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && !generating) startGenerate();
              }}
            />
          </label>
          <button type="button" disabled={generating} onClick={startGenerate}>
            {generating ? t.generating : suggestions && suggestions.length > 0 ? t.regenerate : t.generate}
          </button>
          <p className="hint">{t.whatIsSent}</p>
        </div>
      )}
      {generateError !== undefined && <p className="error">{generationErrorMessage(text, generateError)}</p>}
      {changeError !== undefined && <p className="error">{changeErrorMessage(t, changeError)}</p>}
      {leftOutNames.length > 0 && <p className="hint">{fill(t.leftOut, { interviews: leftOutNames.join(", ") })}</p>}
      {dropped > 0 && <p className="hint">{fill(t.dropped, { count: String(dropped) })}</p>}
      {suggestions && suggestions.length === 0 && apiKeySaved && !generating && <p className="empty">{t.empty}</p>}
      {visible.length > 0 && (
        <ul className="ai-note-list">
          {visible.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              interviews={interviews}
              busy={busy}
              onAccept={() => void accept(suggestion.id)}
              onEdit={(newText) => change(() => api.editSuggestedQuestion(suggestion.id, newText))}
              onDismiss={() => void change(() => api.dismissSuggestedQuestion(suggestion.id))}
              onRestore={() => void change(() => api.restoreSuggestedQuestion(suggestion.id))}
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
          <p>{fill(t.confirmRegenerateDetail, { count: String(replacedCount) })}</p>
        </ConfirmDialog>
      )}
      {settingsOpen && <ApiKeyDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

interface SuggestionItemProps {
  suggestion: SuggestedQuestion;
  interviews: Interview[];
  busy: boolean;
  onAccept: () => void;
  onEdit: (text: string) => Promise<boolean>;
  onDismiss: () => void;
  onRestore: () => void;
}

function SuggestionItem({ suggestion, interviews, busy, onAccept, onEdit, onDismiss, onRestore }: SuggestionItemProps) {
  const { text } = useText();
  const t = text.panels.questions.suggestions;
  const [editing, setEditing] = useState<string | undefined>();
  const [showEvidence, setShowEvidence] = useState(false);
  const where = (evidence: SuggestionEvidence) => evidenceLocation(text, interviews, evidence);
  // The quotes also show on hover, as the title of the button that opens them.
  const quotesOnHover = suggestion.evidence.map((e) => `“${e.quote}” (${where(e)})`).join("\n");

  async function save() {
    if (editing === undefined || busy) return;
    if (await onEdit(editing)) setEditing(undefined);
  }

  function onEditKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") setEditing(undefined);
    else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  const classes = ["ai-note", "suggestion", suggestion.dismissed && "dismissed"];
  return (
    <li className={classes.filter(Boolean).join(" ")}>
      <span className="ai-label suggestion-label">{t.label}</span>
      {editing === undefined ? (
        <p className="ai-note-statement">{suggestion.text}</p>
      ) : (
        <div className="ai-note-edit">
          <textarea
            aria-label={t.edit}
            rows={2}
            value={editing}
            autoFocus
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={onEditKey}
          />
          <div className="ai-note-actions">
            <button type="button" className="link-button" disabled={busy} onClick={() => void save()}>
              {t.save}
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(undefined)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      <p className="suggestion-reason">
        {suggestion.reason}{" "}
        {suggestion.source === "aiClient" && <span className="source-tag">{t.fromAiClient}</span>}{" "}
        {suggestion.general ? (
          <span className="review-state" title={t.generalHint}>
            {t.general}
          </span>
        ) : (
          <button
            type="button"
            className="link-button suggestion-evidence-toggle"
            aria-expanded={showEvidence}
            aria-label={showEvidence ? t.hideEvidence : t.showEvidence}
            title={quotesOnHover}
            onClick={() => setShowEvidence(!showEvidence)}
          >
            ⓘ
          </button>
        )}
      </p>
      {showEvidence &&
        suggestion.evidence.map((evidence, i) => (
          <p key={i} className="ai-note-quote suggestion-quote">
            <span className="ai-note-quote-mark">❝</span>
            <span className="ai-note-quote-text">{evidence.quote}</span>
            <span className="ai-note-quote-where">{where(evidence)}</span>
          </p>
        ))}
      {editing === undefined && (
        <div className="ai-note-actions">
          {suggestion.accepted && <span className="review-state">{t.accepted}</span>}
          {!suggestion.accepted && !suggestion.dismissed && (
            <>
              <button type="button" className="link-button" disabled={busy} onClick={onAccept}>
                {t.accept}
              </button>
              <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(suggestion.text)}>
                {t.edit}
              </button>
            </>
          )}
          {suggestion.dismissed ? (
            <button type="button" className="link-button" disabled={busy} onClick={onRestore}>
              {t.restore}
            </button>
          ) : (
            <button type="button" className="link-button" disabled={busy} onClick={onDismiss}>
              {t.dismiss}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// "CV, page 1" or "First Interview, part 12".
function evidenceLocation(text: Text, interviews: Interview[], evidence: SuggestionEvidence): string {
  const t = text.panels.questions.suggestions;
  if (evidence.source === "cv") return fill(t.cvPage, { page: String(evidence.page) });
  const interview = interviews.find((i) => i.id === evidence.interviewId);
  return fill(t.segment, {
    interview: interview ? interviewName(text, interview) : "",
    number: String(evidence.segmentNumber),
  });
}

// Generation failures use the same words as AI Notes: both say the data is unchanged.
function generationErrorMessage(text: Text, error: unknown): string {
  const t = text.panels.aiNotes.errors;
  if (error instanceof ApiError) {
    if (error.reason === "apiKeyMissing") return t.reasons.apiKeyMissing;
    if (error.failure) return `${t.failed} ${t.failures[error.failure]}`;
  }
  return t.failed;
}

function changeErrorMessage(t: Text["panels"]["questions"]["suggestions"], error: unknown): string {
  if (error instanceof ApiError) {
    if (error.field === "text" && error.rule === "required") return t.required;
    if (error.status === 404) return t.gone;
    if (error.reason === "suggestionAccepted" || error.reason === "suggestionDismissed") return t.reasons[error.reason];
  }
  return t.changeFailed;
}
