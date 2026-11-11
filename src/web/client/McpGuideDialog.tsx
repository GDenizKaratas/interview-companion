import { useEffect, useState } from "react";
import type { ClaudeDesktopState } from "../claude-desktop.ts";
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

// The states in which the one-click connect cannot work, so the manual way is shown open.
const cannotConnect: ClaudeDesktopState[] = ["unsupported", "notInstalled", "unreadable"];

type Desktop = { state: ClaudeDesktopState; configPath: string | null };

// How to use AI without an API key: connect the Interviewer's own AI application to the MCP server
// once, then ask it about a Candidate by name in plain words; it reads the Candidate from the app
// and, when saving is allowed, saves what it writes here. Claude Desktop is connected with one
// click, which writes this copy's entry into its configuration file; the text to add by hand stays
// below it, folded. Claude Code gets a command for a folder kept for interviews, so the tools are
// not there in its other chats, and, folded, one for every folder. Both come from the server, so they hold the real
// paths of this copy and can be pasted as they are.
export function McpGuideDialog({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  const t = text.mcpGuide;
  const [setup, setSetup] = useState<Record<AppKey | "everyFolder", string | null>>({ desktop: null, code: null, everyFolder: null });
  const [app, setApp] = useState<AppKey>("desktop");
  const [copied, setCopied] = useState<string | null>(null);
  const [clientWrites, setClientWrites] = useState<boolean | undefined>();
  const [error, setError] = useState(false);
  // undefined while loading; null when the state could not be read.
  const [desktop, setDesktop] = useState<Desktop | null | undefined>();
  const [connect, setConnect] = useState<"idle" | "busy" | "done" | "failed">("idle");

  useEffect(() => {
    // Without the setup the guide still explains the steps; docs/mcp.md has the rest.
    api.getMcpSetup().then(
      ({ command, commandEveryFolder, desktopConfig }) =>
        setSetup({
          desktop: desktopConfig,
          code: command,
          everyFolder: commandEveryFolder,
        }),
      () => {},
    );
    api.getClaudeDesktop().then(setDesktop, () => setDesktop(null));
    api.getAiClientWrites().then(
      (setting) => setClientWrites(setting.allowed),
      () => setError(true),
    );
  }, []);

  const snippet = setup[app];

  // Copies a text and marks it copied for a moment; `key` says which button shows it.
  function copy(value: string | null, key: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
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

  async function connectDesktop() {
    setConnect("busy");
    try {
      const { state } = await api.connectClaudeDesktop();
      setDesktop((current) => ({
        state,
        configPath: current?.configPath ?? null,
      }));
      setConnect("done");
    } catch {
      // A refusal says why through the state, read again; anything else is a plain failure.
      const now = await api.getClaudeDesktop().catch(() => undefined);
      if (now) setDesktop(now);
      setConnect(now && cannotConnect.includes(now.state) ? "idle" : "failed");
    }
  }

  const desktopState = desktop?.state;
  const desktopMessage =
    connect === "done"
      ? t.desktop.done
      : connect === "failed"
        ? t.desktop.failed
        : desktopState && desktopState !== "notConnected"
          ? t.desktop[desktopState]
          : null;
  const canConnect = desktopState === "notConnected" || desktopState === "otherCopy";
  const connectedNow = connect === "done" || desktopState === "connected";

  // Step 1 holds the choice of application and, for Claude Desktop, the one-click connect.
  const appChoice = (
    <>
      <div className="view-choice guide-apps" role="group" aria-label={t.connectLabel}>
        {appKeys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={app === key}
            className={app === key ? "role-choice chosen" : "role-choice"}
            onClick={() => {
              setApp(key);
              setCopied(null);
            }}
          >
            {t.apps[key].name}
          </button>
        ))}
      </div>
      {app === "code" && <span className="step-hint step-app-hint">{t.apps.code.hint}</span>}
      {app === "desktop" && desktop !== undefined && (canConnect || desktopMessage) && (
        <div className="desktop-connect">
          {canConnect && connect !== "done" && (
            <button type="button" disabled={connect === "busy"} onClick={() => void connectDesktop()}>
              {desktopState === "otherCopy" ? t.desktop.connectAgain : t.desktop.connect}
            </button>
          )}
          {desktopMessage && (
            <span className={connectedNow ? "desktop-state ok" : "desktop-state"} role="status">
              {desktopMessage}
            </span>
          )}
        </div>
      )}
    </>
  );

  const steps = t.steps.map((step, index) => ({
    ...step,
    icon: icons[index] ?? [],
    extra:
      index === 0 ? (
        appChoice
      ) : index === askStep ? (
        <ul className="step-examples">
          {t.examples.map((example) => (
            <li key={example}>
              <button type="button" className="example-chip" onClick={() => copy(example, example)}>
                {copied === example ? t.exampleCopied : example}
              </button>
            </li>
          ))}
        </ul>
      ) : index === savingStep && clientWrites !== undefined ? (
        <div className={clientWrites ? "save-switch on" : "save-switch"}>
          <button
            type="button"
            role="switch"
            aria-checked={clientWrites}
            aria-describedby="save-switch-state"
            onClick={() => void changeClientWrites(!clientWrites)}
          >
            <span className="save-switch-track" aria-hidden="true">
              <span className="save-switch-thumb" />
            </span>
            {t.clientWrites}
          </button>
          <span id="save-switch-state" className="save-switch-state">
            {clientWrites ? t.clientWritesOn : t.clientWritesOff}
          </span>
        </div>
      ) : undefined,
  }));

  // The text to paste: for Claude Desktop with where it goes; Claude Code's hint is in step 1.
  const manual = snippet && (
    <>
      {app === "desktop" && (
        <p className="guide-connect-hint">
          {t.apps.desktop.hint}
          {desktop?.configPath && (
            <>
              {" "}
              <code className="guide-path">{desktop.configPath}</code>
            </>
          )}
        </p>
      )}
      <div className="command">
        <code>{snippet}</code>
        <button type="button" className="quiet" onClick={() => copy(snippet, "snippet")}>
          {copied === "snippet" ? t.copied : t.copy}
        </button>
      </div>
    </>
  );

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
      <div className="mcp-guide">
        <p className="guide-intro">{t.intro}</p>
        <StepFlow steps={steps} label={t.title} />
        <p className="guide-note guide-when">
          {t.when}{" "}
          <button type="button" className="example-chip command-chip" onClick={() => copy(t.askCommand, "askCommand")}>
            {copied === "askCommand" ? t.exampleCopied : t.askCommand}
          </button>
        </p>
        {app === "desktop" ? (
          <>
            {manual && desktop !== undefined && (
              // Open when the one-click connect cannot work here; folded otherwise.
              <details className="guide-manual" open={desktop === null || cannotConnect.includes(desktop.state)}>
                <summary>{t.desktop.manual}</summary>
                {manual}
              </details>
            )}
          </>
        ) : (
          <>
            {manual}
            {setup.everyFolder && (
              <details className="guide-manual">
                <summary>{t.everyFolder}</summary>
                <div className="command">
                  <code>{setup.everyFolder}</code>
                  <button type="button" className="quiet" onClick={() => copy(setup.everyFolder, "everyFolder")}>
                    {copied === "everyFolder" ? t.copied : t.copy}
                  </button>
                </div>
              </details>
            )}
          </>
        )}
        {error && <p className="error">{t.saveFailed}</p>}
        <p className="guide-note">{t.safety}</p>
      </div>
    </ModalDialog>
  );
}
