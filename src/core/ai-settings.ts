import type { DatabaseSync } from "node:sqlite";
import { InvalidInputError } from "./errors.ts";
import { deleteSetting, getSetting, setSetting } from "./settings.ts";

// The Anthropic API key the in-app AI uses. It is stored in the local database, like
// everything else, and no operation ever returns it: callers can only ask whether one is saved.

const settingKey = "anthropic_api_key";

export function saveApiKey(db: DatabaseSync, apiKey: string): void {
  const trimmed = apiKey.trim();
  if (trimmed === "") throw new InvalidInputError("apiKey", "required", "Enter an API key.");
  setSetting(db, settingKey, trimmed);
}

export function removeApiKey(db: DatabaseSync): void {
  deleteSetting(db, settingKey);
}

export function hasApiKey(db: DatabaseSync): boolean {
  return readApiKey(db) !== undefined;
}

// Only for the AI code in core, which hands the key to the provider.
export function readApiKey(db: DatabaseSync): string | undefined {
  return getSetting(db, settingKey);
}
