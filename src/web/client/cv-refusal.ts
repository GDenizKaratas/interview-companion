import { ApiError } from "./api.ts";
import type { Text } from "./languages.ts";

// Core decides whether a CV is accepted; this only says why it was refused, in the current language.
export function cvRefusalMessage(text: Text, error: unknown): string {
  const messages = text.panels.cv.refused;
  if (error instanceof ApiError && error.field === "cv") {
    if (error.rule === "readableText") return messages.readableText;
    if (error.rule === "format") return messages.format;
  }
  return text.panels.cv.uploadFailed;
}
