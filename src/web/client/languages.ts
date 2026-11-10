import type english from "./translations/en.ts";

// The shape every translation file follows: the language's name in that language,
// and the same text keys as English.
export type Text = (typeof english)["text"];
export interface TranslationFile {
  name: string;
  text: Text;
}
export interface Language extends TranslationFile {
  code: string;
}

// Core owns the default language and sends it. This copy is only the fallback when core
// cannot be reached or names a language that has no translation file.
export const defaultLanguageCode = "tr";

// Every file in translations/ is a language; its file name is the language code.
// Adding a language means adding one file there and nothing else.
const files = import.meta.glob<TranslationFile>("./translations/*.ts", { eager: true, import: "default" });

export const languages: Language[] = Object.entries(files)
  .map(([path, file]) => ({ code: path.replace(/^.*\/(.+)\.ts$/, "$1"), ...file }))
  .sort((a, b) => Number(b.code === defaultLanguageCode) - Number(a.code === defaultLanguageCode) || a.code.localeCompare(b.code));

// The translation for a language code, or English when there is no file for it.
export function translationFor(code: string): Language {
  return (
    languages.find((language) => language.code === code) ??
    languages.find((language) => language.code === defaultLanguageCode)!
  );
}

// Fills the {name} places in a translated text: fill("Interview {number}", { number: "11" }).
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (place, name: string) => values[name] ?? place);
}
