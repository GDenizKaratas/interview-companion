import type { DatabaseSync } from "node:sqlite";
import { InvalidInputError, PreconditionError } from "./errors.ts";
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

// Whether the AI client (through MCP) may save AI Notes, Suggested Questions, and Candidate
// Briefs. Off until the Interviewer turns it on in AI Settings. Only the web interface can
// change it: the AI client's view of core does not hold the switch.
const aiClientWritesKey = "ai_client_writes";

export function aiClientWritesAllowed(db: DatabaseSync): boolean {
  return getSetting(db, aiClientWritesKey) === "yes";
}

export function allowAiClientWrites(db: DatabaseSync, allowed: boolean): void {
  if (allowed) setSetting(db, aiClientWritesKey, "yes");
  else deleteSetting(db, aiClientWritesKey);
}

// Refuses a write from the AI client while the Interviewer has not allowed it.
export function requireAiClientWrites(db: DatabaseSync): void {
  if (!aiClientWritesAllowed(db)) {
    throw new PreconditionError(
      "aiClientWritesOff",
      "Saving from the AI client is off. Turn it on in Interview Companion's AI Settings, then try again.",
    );
  }
}
