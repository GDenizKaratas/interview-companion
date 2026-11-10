import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, openCore, type Core } from "./index.ts";

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

describe("Candidates", () => {
  it("lists a Candidate after it is created", () => {
    const created = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    expect(core.listCandidates()).toEqual([created]);
    expect(created.name).toBe("Ada Demir");
    expect(created.role).toBe("Backend Engineer");
  });

  it("keeps Candidates after the database is closed and opened again", () => {
    const created = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    core.close();

    core = openCore(dbPath);

    expect(core.listCandidates()).toEqual([created]);
  });

  it("lists the newest Candidate first", () => {
    const first = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    const second = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const third = core.createCandidate({ name: "Ece Yalın", role: "Frontend Engineer" });

    expect(core.listCandidates().map((c) => c.id)).toEqual([third.id, second.id, first.id]);
  });

  it("trims spaces around the name and role", () => {
    const created = core.createCandidate({ name: "  Ada Demir ", role: " Backend Engineer  " });

    expect(created.name).toBe("Ada Demir");
    expect(created.role).toBe("Backend Engineer");
  });

  it("refuses a Candidate without a name or a role and saves nothing", () => {
    expect(() => core.createCandidate({ name: "   ", role: "Backend Engineer" })).toThrow(
      InvalidInputError,
    );
    expect(() => core.createCandidate({ name: "Ada Demir", role: "" })).toThrow(InvalidInputError);

    expect(core.listCandidates()).toEqual([]);
  });

  it("finds one Candidate by id, and nothing for an unknown id", () => {
    core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    const wanted = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    expect(core.getCandidate(wanted.id)).toEqual(wanted);
    expect(core.getCandidate("no-such-id")).toBeUndefined();
  });

  it("lists each role once, in alphabetical order", () => {
    core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });

    expect(core.listCandidateRoles()).toEqual(["Backend Engineer", "Data Engineer"]);
  });

  it("saves a role under the existing spelling when it differs only in letter case or spaces", () => {
    core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    const second = core.createCandidate({ name: "Can Aksoy", role: "backend  ENGINEER" });

    expect(second.role).toBe("Backend Engineer");
    expect(core.listCandidateRoles()).toEqual(["Backend Engineer"]);
  });

  it("matches an existing Turkish role written in capital letters", () => {
    core.createCandidate({ name: "Ada Demir", role: "Yazılım Mühendisi" });

    const second = core.createCandidate({ name: "Can Aksoy", role: "YAZILIM MÜHENDİSİ" });

    expect(second.role).toBe("Yazılım Mühendisi");
  });

  it("matches a role that mixes English and Turkish words in capital letters", () => {
    core.createCandidate({ name: "Ada Demir", role: "Senior Yazılım Mühendisi" });

    const second = core.createCandidate({ name: "Can Aksoy", role: "SENIOR YAZILIM MÜHENDİSİ" });

    expect(second.role).toBe("Senior Yazılım Mühendisi");
  });

  it("keeps the spelling that was written first", () => {
    core.createCandidate({ name: "Ada Demir", role: "backend engineer" });

    const second = core.createCandidate({ name: "Can Aksoy", role: "Backend Engineer" });

    expect(second.role).toBe("backend engineer");
  });
});
