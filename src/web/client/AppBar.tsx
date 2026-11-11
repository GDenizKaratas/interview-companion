import { useEffect, useState } from "react";
import { ApiKeyDialog, apiKeyChanged } from "./ApiKeyDialog.tsx";
import { api } from "./api.ts";
import { HowItWorksDialog } from "./HowItWorksDialog.tsx";
import { McpGuideDialog } from "./McpGuideDialog.tsx";
import { linkTo } from "./navigation.ts";
import { languages } from "./languages.ts";
import { useText } from "./text.tsx";

// Fired on window to open the guide for using AI through MCP, from anywhere in the app.
export const openMcpGuide = "open-mcp-guide";

type Open = "howItWorks" | "apiKey" | "mcp" | undefined;

// The bar at the top of every page: the app's mark and name, how the app works, the two ways
// to use AI (an API key, or MCP), and the interface language switch.
export function AppBar() {
  const { text, languageCode, chooseLanguage } = useText();
  const [open, setOpen] = useState<Open>();
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const loadKey = () => api.getApiKeyStatus().then((status) => setKeySaved(status.saved), () => {});
    const showMcp = () => setOpen("mcp");
    void loadKey();
    window.addEventListener(apiKeyChanged, loadKey);
    window.addEventListener(openMcpGuide, showMcp);
    return () => {
      window.removeEventListener(apiKeyChanged, loadKey);
      window.removeEventListener(openMcpGuide, showMcp);
    };
  }, []);

  return (
    <header className="app-bar">
      <a className="brand" href="/" onClick={linkTo("/")}>
        <QuoteMark />
        <span className="brand-name">{text.appName}</span>
      </a>
      <span className="tagline">{text.tagline}</span>
      <button type="button" className="bar-button bar-help" aria-label={text.howItWorks.open} title={text.howItWorks.open} onClick={() => setOpen("howItWorks")}>
        ?
      </button>
      <button type="button" className="bar-button" title={keySaved ? text.aiSettings.saved : undefined} onClick={() => setOpen("apiKey")}>
        {keySaved && <span className="bar-check">✔</span>}
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
        <HowItWorksDialog onUseApiKey={() => setOpen("apiKey")} onUseMcp={() => setOpen("mcp")} onClose={() => setOpen(undefined)} />
      )}
      {open === "apiKey" && <ApiKeyDialog onClose={() => setOpen(undefined)} />}
      {open === "mcp" && <McpGuideDialog onClose={() => setOpen(undefined)} />}
    </header>
  );
}

// An opening quotation mark: the app is about what was actually said.
function QuoteMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="currentColor" />
      <path
        d="M8.5 22.5v-4.2c0-3.9 1.9-6.9 5.4-8.3l1 1.7c-1.9.9-2.9 2.4-3.1 4.1h3.1v6.7zm9 0v-4.2c0-3.9 1.9-6.9 5.4-8.3l1 1.7c-1.9.9-2.9 2.4-3.1 4.1h3.1v6.7z"
        fill="var(--surface)"
      />
    </svg>
  );
}
