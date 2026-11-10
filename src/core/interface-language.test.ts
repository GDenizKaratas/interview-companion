import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCore, type Core } from "./index.ts";

let dir: string;
let dbPath: string;
let core: Core;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  core = openCore(dbPath);
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Interface language", () => {
  it("is English until the Interviewer chooses another", () => {
    expect(core.getInterfaceLanguage()).toBe("en");
  });

  it("remembers the chosen language after the database is closed and opened again", () => {
    core.setInterfaceLanguage("tr");
    core.close();

    core = openCore(dbPath);

    expect(core.getInterfaceLanguage()).toBe("tr");
  });

  it("refuses a value that is not a language code and keeps the earlier choice", () => {
    core.setInterfaceLanguage("tr");

    for (const value of ["", "  ", "Turkish", "t", "tr_TR", "<script>"]) {
      expect(() => core.setInterfaceLanguage(value)).toThrow(
        expect.objectContaining({ field: "language", rule: "format" }),
      );
    }
    expect(core.getInterfaceLanguage()).toBe("tr");
  });

  it("accepts a language code with a region", () => {
    core.setInterfaceLanguage("pt-BR");

    expect(core.getInterfaceLanguage()).toBe("pt-BR");
  });
});
