import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.ts";
import { defaultLanguageCode, translationFor, type Text } from "./languages.ts";

interface TextContext {
  text: Text;
  languageCode: string;
  chooseLanguage: (code: string) => void;
}

const Context = createContext<TextContext | undefined>(undefined);

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

  // The switch changes at once; core remembers it for the next visit.
  function chooseLanguage(code: string) {
    setLanguageCode(code);
    api.setInterfaceLanguage(code).catch(() => {});
  }

  return (
    <Context.Provider value={{ text: translation.text, languageCode: translation.code, chooseLanguage }}>
      {children}
    </Context.Provider>
  );
}

export function useText(): TextContext {
  const context = useContext(Context);
  if (!context) throw new Error("useText must be used inside TextProvider.");
  return context;
}
