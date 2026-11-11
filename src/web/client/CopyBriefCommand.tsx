import { useEffect, useState } from "react";
import { briefCommand } from "./brief-command.ts";
import { useText } from "./text.tsx";

// The button in the Candidate Brief dialog that copies the brief command for this Candidate, so the Interviewer
// only pastes it into Claude Code. It says Copied for a moment, or that copying failed.
export function CopyBriefCommand({ candidateName }: { candidateName: string }) {
  const { text } = useText();
  const t = text.workspace;
  const command = briefCommand(candidateName);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  function copy() {
    navigator.clipboard.writeText(command).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  }

  return (
    <button type="button" className="secondary brief-command-button" title={`${t.copyBriefCommandHint}\n${command}`} onClick={copy}>
      {state === "copied" ? t.briefCommandCopied : state === "failed" ? t.briefCommandCopyFailed : t.copyBriefCommand}
    </button>
  );
}
