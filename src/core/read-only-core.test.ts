import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCore, readOnlyCore, type Core } from "./index.ts";

let dir: string;
let core: Core;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"));
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Read-only view of core", () => {
  it("reads the same data as core", () => {
    const candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    expect(readOnlyCore(core).listCandidates()).toEqual([candidate]);
  });

  it("holds no operation that changes data, not even behind a type cast", () => {
    const view = readOnlyCore(core) as unknown as Record<string, unknown>;

    for (const write of [
      "createCandidate",
      "createCandidateWithCv",
      "deleteCandidate",
      "loadDemoCandidate",
      "loadDemoCandidateOnFirstStart",
      "addInterview",
      "addInterviewerNotes",
      "editInterviewerNote",
      "tagInterviewerNote",
      "deleteInterviewerNote",
      "setInterfaceLanguage",
      "addSavedQuestion",
      "editSavedQuestion",
      "deleteSavedQuestion",
      "moveSavedQuestion",
      "attachCv",
      "importTranscript",
      "confirmSpeakerMapping",
      "close",
    ]) {
      expect(view[write], write).toBeUndefined();
    }
  });
});
