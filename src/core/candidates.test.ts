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

  it("names the missing field and the broken rule, so the interface can say it in any language", () => {
    expect(() => core.createCandidate({ name: "", role: "Backend Engineer" })).toThrow(
      expect.objectContaining({ field: "name", rule: "required" }),
    );
    expect(() => core.createCandidate({ name: "Ada Demir", role: " " })).toThrow(
      expect.objectContaining({ field: "role", rule: "required" }),
    );
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

describe("Roles in use", () => {
  it("lists each role a Candidate has, in alphabetical order, with its Candidates", () => {
    const ada = core.createCandidate({ name: "Ada Demir", role: "Veri Analisti" });
    const can = core.createCandidate({ name: "Can Aksoy", role: "Backend Engineer" });
    const ece = core.createCandidate({ name: "Ece Yalın", role: "Veri Analisti" });

    expect(core.listRolesInUse()).toEqual([
      { role: "Backend Engineer", candidateIds: [can.id] },
      { role: "Veri Analisti", candidateIds: [ada.id, ece.id] },
    ]);
  });

  it("counts roles that differ only in letter case or spaces as one, under the spelling written first", () => {
    const ada = core.createCandidate({ name: "Ada Demir", role: "veri analisti" });
    const can = core.createCandidate({ name: "Can Aksoy", role: "VERİ  ANALİSTİ" });

    expect(core.listRolesInUse()).toEqual([{ role: "veri analisti", candidateIds: [ada.id, can.id] }]);
  });

  it("leaves out a role that only Role Questions use", () => {
    core.addRoleQuestion({ role: "Data Engineer", text: "How do you test a pipeline?" });

    expect(core.listRolesInUse()).toEqual([]);
  });

  it("says a role is in use when a Candidate has it, by the same rule that saves roles", () => {
    core.createCandidate({ name: "Ada Demir", role: "Veri Analisti" });
    core.addRoleQuestion({ role: "Data Engineer", text: "How do you test a pipeline?" });

    expect(core.isRoleInUse("  VERİ   analisti ")).toBe(true);
    expect(core.isRoleInUse("Veri Bilimci")).toBe(false);
    expect(core.isRoleInUse("Data Engineer")).toBe(false);
    expect(core.isRoleInUse("   ")).toBe(false);
  });
});
