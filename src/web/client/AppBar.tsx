import { useEffect, useState } from "react";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api } from "./api.ts";
import { HowItWorksDialog } from "./HowItWorksDialog.tsx";
import { McpGuideDialog, openMcpGuide } from "./McpGuideDialog.tsx";
import { linkTo } from "./navigation.ts";
import { languages } from "./languages.ts";
import { TranscriptGuideDialog, openTranscriptGuide } from "./TranscriptGuideDialog.tsx";
import { useText } from "./text.tsx";

type Open = "howItWorks" | "apiKey" | "mcp" | "transcriptGuide" | undefined;

// The bar at the top of every page: the app's mark and name, how the app works, the two ways
// to use AI (an API key, or MCP), and the interface language switch. It also holds the guide on
// getting a Transcript, opened from the Transcript card and from How it works.
export function AppBar() {
  const { text, languageCode, chooseLanguage } = useText();
  const [open, setOpen] = useState<Open>();
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const loadKey = () => api.getApiKeyStatus().then((status) => setKeySaved(status.saved), () => {});
    const showMcp = () => setOpen("mcp");
    const showTranscriptGuide = () => setOpen("transcriptGuide");
    void loadKey();
    window.addEventListener(apiKeyChanged, loadKey);
    window.addEventListener(openMcpGuide, showMcp);
    window.addEventListener(openTranscriptGuide, showTranscriptGuide);
    return () => {
      window.removeEventListener(apiKeyChanged, loadKey);
      window.removeEventListener(openMcpGuide, showMcp);
      window.removeEventListener(openTranscriptGuide, showTranscriptGuide);
    };
  }, []);

  return (
    <header className="app-bar">
      <a className="brand" href="/" onClick={linkTo("/")}>
        <BrandMark />
        <span className="brand-name">{text.appName}</span>
      </a>
      <span className="tagline">{text.tagline}</span>
      <button type="button" className="bar-button bar-help" aria-label={text.howItWorks.open} title={text.howItWorks.open} onClick={() => setOpen("howItWorks")}>
        ?
      </button>
      <button type="button" className="bar-button" title={keySaved ? text.aiSettings.saved : undefined} onClick={() => setOpen("apiKey")}>
        {keySaved && (
          <span className="bar-check" aria-hidden="true">
            ✔
          </span>
        )}
        {text.aiSettings.open}
      </button>
      <button type="button" className="bar-button" onClick={() => setOpen("mcp")}>
        {text.mcpGuide.open}
      </button>
      <select
        className="language-switch"
        aria-label={text.languageLabel}
        value={languageCode}
        onChange={(event) => chooseLanguage(event.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.name}
          </option>
        ))}
      </select>
      {open === "howItWorks" && (
        <HowItWorksDialog
          onUseApiKey={() => setOpen("apiKey")}
          onUseMcp={() => setOpen("mcp")}
          onTranscriptGuide={() => setOpen("transcriptGuide")}
          onClose={() => setOpen(undefined)}
        />
      )}
      {open === "apiKey" && <ApiKeyDialog onClose={() => setOpen(undefined)} />}
      {open === "mcp" && <McpGuideDialog onClose={() => setOpen(undefined)} />}
      {open === "transcriptGuide" && <TranscriptGuideDialog onClose={() => setOpen(undefined)} />}
    </header>
  );
}

// The app's mark: two overlapping squares, the Interviewer and the Candidate, with what was said
// between them where they meet. Drawn for the navy bar; the tab icon in index.html is the same
// mark for a light background.
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="19" height="19" rx="4.5" fill="#577aff" />
      <rect x="11" y="11" width="19" height="19" rx="4.5" fill="#ffffff" />
      <path d="M11 15.5A4.5 4.5 0 0 1 15.5 11H21v5.5A4.5 4.5 0 0 1 16.5 21H11z" fill="#c9d6ff" />
    </svg>
  );
}
