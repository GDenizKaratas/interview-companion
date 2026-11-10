import { linkTo } from "./navigation.ts";
import { languages } from "./languages.ts";
import { useText } from "./text.tsx";

// The bar at the top of every page: the app's mark, its name, what it is for,
// and the interface language switch.
export function AppBar() {
  const { text, languageCode, chooseLanguage } = useText();
  return (
    <header className="app-bar">
      <a className="brand" href="/" onClick={linkTo("/")}>
        <QuoteMark />
        <span className="brand-name">{text.appName}</span>
      </a>
      <span className="tagline">{text.tagline}</span>
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
    </header>
  );
}

// An opening quotation mark: the app is about what was actually said.
function QuoteMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8.5 22.5v-4.2c0-3.9 1.9-6.9 5.4-8.3l1 1.7c-1.9.9-2.9 2.4-3.1 4.1h3.1v6.7zm9 0v-4.2c0-3.9 1.9-6.9 5.4-8.3l1 1.7c-1.9.9-2.9 2.4-3.1 4.1h3.1v6.7z"
        fill="var(--surface)"
      />
    </svg>
  );
}
