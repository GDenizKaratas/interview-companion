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

  it("holds only the read operations, so no write is reachable, not even behind a type cast", () => {
    expect(Object.keys(readOnlyCore(core)).sort()).toEqual([
      "getCandidate",
      "getCandidateOverview",
      "getCv",
      "getTranscript",
      "listCandidateRoles",
      "listCandidates",
      "listInterviewerNotes",
      "listInterviews",
      "listSavedQuestions",
      "listTranscriptFormats",
      "searchEvidence",
    ]);
  });
});
