import { useEffect, useId, useState } from "react";
import { api } from "./api.ts";
import { useText } from "./text.tsx";

// How to use AI without an API key: connect an AI client to the read-only MCP server. The
// command comes from the server, so it holds the real path of this copy and can be pasted as is.
// With a title it stands alone, as in the AI settings; without one, a card around it gives the title.
export function NoKeyGuide({ className, withTitle = true }: { className?: string; withTitle?: boolean }) {
  const { text } = useText();
  const t = text.noKey;
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The guide can be on the page and in the AI settings at once, so its title id is unique.
  const titleId = useId();

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
    <section
      className={className ? `no-key-guide ${className}` : "no-key-guide"}
      aria-labelledby={withTitle ? titleId : undefined}
    >
      {withTitle && <h2 id={titleId}>{t.title}</h2>}
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
