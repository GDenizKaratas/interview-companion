import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { openMcpGuide } from "./McpGuideDialog.tsx";
import { useText } from "./text.tsx";

// Fired on window when the API key is saved or removed, so the AI Notes panel can update.
export const apiKeyChanged = "api-key-changed";

// Using AI with an API key: entering or removing the key, and what is sent to the model.
// The key is sent to the local server once and is never shown again.
export function ApiKeyDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.aiSettings;
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState<boolean | undefined>();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    api.getApiKeyStatus().then(
      (status) => setSaved(status.saved),
      () => setError(t.loadFailed),
    );
  }, [t.loadFailed]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.saveApiKey(key);
      setKey("");
      setSaved(true);
      window.dispatchEvent(new Event(apiKeyChanged));
    } catch (caught) {
      // Core decides what a valid key is; its field and rule pick the message.
      const refusedAsMissing = caught instanceof ApiError && caught.field === "apiKey" && caught.rule === "required";
      setError(refusedAsMissing ? t.required : t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmingRemove(false);
    setBusy(true);
    setError(undefined);
    try {
      await api.removeApiKey();
      setSaved(false);
      window.dispatchEvent(new Event(apiKeyChanged));
    } catch {
      setError(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog settings-dialog"
      aria-labelledby="ai-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="ai-settings-title">{t.title}</h2>
      <p className="settings-status">{saved === undefined ? "" : saved ? `✔ ${t.saved}` : t.notSaved}</p>
      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <label>
          {saved ? t.replaceLabel : t.keyLabel}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {t.save}
        </button>
      </form>
      <div className="settings-privacy">
        <p>{t.storedLocally}</p>
        <p>{t.whatIsSent}</p>
        <p>{t.notSent}</p>
      </div>
      {saved !== undefined && (
        <p className="settings-other-way">
          {t.noKeyWay}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event(openMcpGuide));
            }}
          >
            {text.mcpGuide.open}
          </button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="confirm-dialog-actions">
        {saved && (
          <button type="button" className="quiet" disabled={busy} onClick={() => setConfirmingRemove(true)}>
            {t.remove}
          </button>
        )}
        <button type="button" onClick={onClose}>
          {t.close}
        </button>
      </div>
      {confirmingRemove && (
        <ConfirmDialog
          title={t.confirmRemove}
          confirmLabel={t.remove}
          cancelLabel={t.cancel}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmingRemove(false)}
        >
          <p>{t.confirmRemoveDetail}</p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
