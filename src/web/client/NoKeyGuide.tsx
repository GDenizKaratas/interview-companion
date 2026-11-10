import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useText } from "./text.tsx";

// How to use AI without an API key: connect an AI client to the read-only MCP server. The
// command comes from the server, so it holds the real path of this copy and can be pasted as is.
export function NoKeyGuide({ className }: { className?: string }) {
  const { text } = useText();
  const t = text.noKey;
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Without the command the guide still explains the steps; docs/mcp.md has the rest.
    api.getMcpSetup().then(({ command }) => setCommand(command), () => {});
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

  return (
    <section className={className ? `no-key-guide ${className}` : "no-key-guide"} aria-labelledby="no-key-title">
      <h2 id="no-key-title">{t.title}</h2>
      <p>{t.intro}</p>
      <p className="no-key-step">{t.stepAdd}</p>
      {command && (
        <div className="command">
          <code>{command}</code>
          <button type="button" className="quiet" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
      )}
      <p className="no-key-step">{t.stepAsk}</p>
      <p className="no-key-step">{t.stepBrief}</p>
      <p className="no-key-note">{t.desktop}</p>
      <p className="no-key-note">{t.readOnly}</p>
    </section>
  );
}
