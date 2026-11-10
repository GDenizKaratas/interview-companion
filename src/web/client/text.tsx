import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.ts";
import { defaultLanguageCode, translationFor, type Text } from "./languages.ts";

interface LanguageContextValue {
  text: Text;
  languageCode: string;
  chooseLanguage: (code: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

// Loads the Interviewer's chosen language from core and gives every component its text.
// Nothing is shown until the language is known, so the page never flashes in English first.
export function TextProvider({ children }: { children: ReactNode }) {
  const [languageCode, setLanguageCode] = useState<string | undefined>();

  useEffect(() => {
    api.getInterfaceLanguage().then(
      ({ language }) => setLanguageCode(language),
      () => setLanguageCode(defaultLanguageCode),
    );
  }, []);

  const translation = translationFor(languageCode ?? defaultLanguageCode);

  useEffect(() => {
    if (languageCode === undefined) return;
    document.documentElement.lang = translation.code;
    document.title = translation.text.appName;
  }, [languageCode, translation]);

  if (languageCode === undefined) return null;

  // The switch changes at once; core remembers it for the next visit. If core does not
  // save it, the interface goes back to the language core has, so it never shows a
  // choice that will be lost on the next visit.
  function chooseLanguage(code: string) {
    setLanguageCode(code);
    api.setInterfaceLanguage(code).catch(() =>
      api.getInterfaceLanguage().then(({ language }) => setLanguageCode(language), () => {}),
    );
  }

  return (
    <LanguageContext.Provider value={{ text: translation.text, languageCode: translation.code, chooseLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useText(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useText must be used inside TextProvider.");
  return context;
}
