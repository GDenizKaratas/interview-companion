import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { StepFlow } from "./StepFlow.tsx";
import { stepIcons } from "./step-icons.ts";
import { useText } from "./text.tsx";

// Fired on window to open this guide from anywhere in the app. The app bar listens for it.
export const openMcpGuide = "open-mcp-guide";

// One small line drawing for each step, in the order of the steps.
const icons = [stepIcons.link, stepIcons.speech, stepIcons.checkList];

// The step that shows what to ask, and the step that holds the switch letting the AI application
// save what it writes (ADR 0005).
const askStep = 1;
const savingStep = 2;

const appKeys = ["desktop", "code"] as const;
type AppKey = (typeof appKeys)[number];

// How to use AI without an API key: connect the Interviewer's own AI application to the MCP server
// once, then ask it about a Candidate by name; it reads the Candidate from the app and, when saving
// is allowed, saves what it writes here. The connection is shown for Claude Desktop (its config)
// and Claude Code (a command); both come from the server, so they hold the real paths of this copy
// and can be pasted as they are.
export function McpGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.mcpGuide;
  const [setup, setSetup] = useState<Record<AppKey, string | null>>({ desktop: null, code: null });
  const [app, setApp] = useState<AppKey>("desktop");
  const [copied, setCopied] = useState(false);
  const [clientWrites, setClientWrites] = useState<boolean | undefined>();
  const [error, setError] = useState(false);

  useEffect(() => {
    // Without the setup the guide still explains the steps; docs/mcp.md has the rest.
    api.getMcpSetup().then(({ command, desktopConfig }) => setSetup({ desktop: desktopConfig, code: command }), () => {});
    api.getAiClientWrites().then((setting) => setClientWrites(setting.allowed), () => setError(true));
  }, []);

  const snippet = setup[app];

  function copy() {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet).then(
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

  const steps = t.steps.map((step, index) => ({
    ...step,
    icon: icons[index] ?? [],
    extra:
      index === askStep ? (
        <ul className="step-examples">
          {t.examples.map((example) => (
            <li key={example}>“{example}”</li>
          ))}
        </ul>
      ) : index === savingStep && clientWrites !== undefined ? (
        <label className="settings-check step-check">
          <input type="checkbox" checked={clientWrites} onChange={(event) => void changeClientWrites(event.target.checked)} />
          {t.clientWrites}
        </label>
      ) : undefined,
  }));

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
      <StepFlow steps={steps} label={t.title} />
      <p className="guide-label">{t.connectLabel}</p>
      <div className="view-choice guide-routes" role="group" aria-label={t.connectLabel}>
        {appKeys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={app === key}
            className={app === key ? "role-choice chosen" : "role-choice"}
            onClick={() => {
              setApp(key);
              setCopied(false);
            }}
          >
            {t.apps[key].name}
          </button>
        ))}
      </div>
      <p className="guide-connect-hint">{t.apps[app].hint}</p>
      {snippet && (
        <div className="command">
          <code>{snippet}</code>
          <button type="button" className="quiet" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
      )}
      {error && <p className="error">{t.saveFailed}</p>}
      <p className="guide-note">{t.safety}</p>
    </ModalDialog>
  );
}
