import { randomBytes } from "node:crypto";

// The start key: the server's guard that Interview Companion gives its data only in a conversation
// where the user started it. MCP tools are the model's to call, so the standing instructions alone
// rest on the model's judgement; a key does not. The key is given only by start_interview_companion,
// which the AI client asks the user to allow, or inside a prompt, which the user runs themselves.
// The model passes it back as startKey in that conversation; another conversation has no key, and
// every tool refuses it. Claude Desktop may run one server process for all its conversations, so
// the server cannot tell conversations apart by itself; the key is what tells them apart.

// What every tool answers without a valid key, and nothing else: no data, and no hint of who is in
// the app.
export const notStartedMessage =
  "Interview Companion is not started in this conversation. Ask the user whether to start it; do not call Interview Companion tools unless they say yes.";

// How many keys a server process keeps; the oldest is dropped first. A process lives for one
// Claude Code session or one Claude Desktop run, so this is far more than are ever given.
const keptKeys = 1000;

export interface StartKeys {
  // Gives a fresh key and remembers it for the life of the process.
  issue(): string;
  // Whether this value is a key this process gave and still keeps.
  isValid(value: unknown): boolean;
}

export function createStartKeys(): StartKeys {
  const keys = new Set<string>();
  return {
    issue() {
      // 128 random bits, URL-safe, so it can be copied in a chat without change.
      const key = randomBytes(16).toString("base64url");
      keys.add(key);
      if (keys.size > keptKeys) keys.delete(keys.values().next().value!);
      return key;
    },
    isValid: (value) => typeof value === "string" && keys.has(value),
  };
}

// The sentence that hands a key to the model, in the start tool's answer and in each prompt.
export function startKeySentence(key: string): string {
  return `Your start key for this conversation is ${key}. Pass it as startKey to the other Interview Companion tools in this conversation only.`;
}
