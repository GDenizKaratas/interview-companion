import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openMcpGuide = "open-mcp-guide";

// How to use AI without an API key: the Interviewer's own AI client reads the app's data through
// the MCP server. The steps, the command to run once, and the switch that lets the client save
// what it writes. The command comes from the server, so it holds the real path of this copy and
// can be pasted as it is.
export function McpGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.mcpGuide;
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientWrites, setClientWrites] = useState<boolean | undefined>();
  const [error, setError] = useState(false);

  useEffect(() => {
    // Without the command the guide still explains the steps; docs/mcp.md has the rest.
    api.getMcpSetup().then(({ command }) => setCommand(command), () => {});
    api.getAiClientWrites().then((setting) => setClientWrites(setting.allowed), () => setError(true));
  }, []);

  function copy() {
    if (!command) return;
    navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  async function changeClientWrites(allowed: boolean) {
    setError(false);
    try {
      setClientWrites((await api.setAiClientWrites(allowed)).allowed);
    } catch {
      setError(true);
    }
  }

  return (
    <ModalDialog
      title={t.title}
      kind="info"
      large
      onCancel={onClose}
      actions={
        <button type="button" autoFocus onClick={onClose}>
          {t.close}
        </button>
      }
    >
      <p className="guide-intro">{t.intro}</p>
      <StepFlow steps={t.steps} label={t.title} />
      {command && (
        <>
          <p className="guide-label">{t.commandLabel}</p>
          <div className="command">
            <code>{command}</code>
            <button type="button" className="quiet" onClick={copy}>
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </>
      )}
      {clientWrites !== undefined && (
        <section className="settings-section" aria-labelledby="client-writes-title">
          <h3 id="client-writes-title">{t.clientWrites.title}</h3>
          <label className="settings-check">
            <input type="checkbox" checked={clientWrites} onChange={(event) => void changeClientWrites(event.target.checked)} />
            {t.clientWrites.label}
          </label>
          <p className="settings-detail">{t.clientWrites.detail}</p>
        </section>
      )}
      {error && <p className="error">{t.clientWrites.saveFailed}</p>}
      <p className="guide-note">{t.technical}</p>
    </ModalDialog>
  );
}
