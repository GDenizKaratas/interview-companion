import type { DatabaseSync } from "node:sqlite";
import { InvalidInputError } from "./errors.ts";

// The language the interface is shown in. Later, AI output is written in it too.
// Core stores only a language code; the translation files live in the browser code,
// so core does not need to change when a language is added.
export const defaultInterfaceLanguage = "en";

const settingKey = "interface_language";

// A two- or three-letter language code, with an optional region: "en", "tr", "pt-BR".
const languageCode = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export function getInterfaceLanguage(db: DatabaseSync): string {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(settingKey) as { value: string } | undefined;
  return row?.value ?? defaultInterfaceLanguage;
}

export function setInterfaceLanguage(db: DatabaseSync, language: string): void {
  if (!languageCode.test(language)) {
    throw new InvalidInputError("language", "format", "The interface language must be a language code such as en or tr.");
  }
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    settingKey,
    language,
  );
}
