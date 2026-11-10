import { describe, expect, it } from "vitest";
import { languages, translationFor } from "./languages.ts";

// Every string in a translation, keyed by its path, e.g. "candidates.title".
function flatten(value: unknown, path = ""): Map<string, unknown> {
  if (typeof value !== "object" || value === null) return new Map([[path, value]]);
  return new Map(
    Object.entries(value).flatMap(([key, child]) => [...flatten(child, path ? `${path}.${key}` : key)]),
  );
}

describe("Translation files", () => {
  it("offer Turkish, the default, first and English, each named in its own language", () => {
    expect(languages.slice(0, 2).map(({ code, name }) => ({ code, name }))).toEqual([
      { code: "tr", name: "Türkçe" },
      { code: "en", name: "English" },
    ]);
  });

  it("each give non-empty text for every key English has, and no other keys", () => {
    const englishKeys = [...flatten(translationFor("en").text).keys()].sort();

    for (const language of languages) {
      const entries = flatten(language.text);
      expect([...entries.keys()].sort(), language.code).toEqual(englishKeys);
      for (const [key, value] of entries) {
        expect(typeof value === "string" && value.trim() !== "", `${language.code}: ${key}`).toBe(true);
      }
    }
  });

  it("fall back to Turkish, the default, for a language that has no translation file", () => {
    expect(translationFor("en").text.candidates.title).toBe("Candidates");
    expect(translationFor("de").code).toBe("tr");
  });
});
