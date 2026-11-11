import { describe, expect, it } from "vitest";
import { ApiError } from "./api.ts";
import { languages, translationFor } from "./languages.ts";
import { generationErrorMessage, preconditionMessages, refusalText } from "./refusal-text.ts";

// The browser may not import core's code, only its types, so the list of codes comes from the
// English map. The map's type is a complete Record over core's Precondition, so the compiler
// keeps that list whole; this test keeps every language's words for it non-empty.
describe("Refusal text", () => {
  const codes = Object.keys(preconditionMessages(translationFor("en").text));

  it("has a non-empty message for every Precondition in every language", () => {
    expect(codes.length).toBeGreaterThan(0);
    for (const language of languages) {
      const messages = preconditionMessages(language.text);
      expect(Object.keys(messages).sort(), language.code).toEqual([...codes].sort());
      for (const [code, message] of Object.entries(messages)) {
        expect(message.trim() !== "", `${language.code}: ${code}`).toBe(true);
      }
    }
  });

  it("gives each Precondition its own message, so none falls back to a vague one", () => {
    for (const language of languages) {
      const messages = Object.values(preconditionMessages(language.text));
      expect(new Set(messages).size, language.code).toBe(messages.length);
    }
  });

  it("words a Precondition, an AI failure, and anything else", () => {
    const text = translationFor("en").text;
    expect(refusalText(text, new ApiError(409, "x", { reason: "candidateExists" }), "fallback")).toBe(
      "This Candidate is already in the app with this role.",
    );
    expect(refusalText(text, new ApiError(409, "x", { reason: "suggestionAccepted" }), "fallback")).toBe(
      "This suggestion is already in your questions.",
    );
    expect(generationErrorMessage(text, new ApiError(502, "x", { failure: "rateLimited" }))).toBe(
      "The notes could not be taken. Your data was not changed. Too many requests to the model. Try again in a minute.",
    );
    expect(refusalText(text, new ApiError(400, "x", { field: "text", rule: "required" }), "fallback")).toBe("fallback");
    expect(refusalText(text, new Error("network"), "fallback")).toBe("fallback");
  });
});
