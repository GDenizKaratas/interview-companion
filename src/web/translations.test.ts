import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openCore } from "../core/index.ts";
import { languages } from "./client/languages.ts";

// Translation files live in the browser code, but core decides which language codes it
// can remember. This test lives here because the browser code may not call core.
describe("Translation files and core", () => {
  it("are each named with a language code that core accepts, so the choice can be remembered", () => {
    const dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
    const core = openCore(join(dir, "test.sqlite"));
    try {
      expect(languages.length).toBeGreaterThan(1);
      for (const language of languages) {
        core.setInterfaceLanguage(language.code);
        expect(core.getInterfaceLanguage()).toBe(language.code);
      }
    } finally {
      core.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
