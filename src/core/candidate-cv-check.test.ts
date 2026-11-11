import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCore, type Core } from "./index.ts";
import { makePdf } from "./testing/make-pdf.ts";

const role = "Backend Engineer";

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

// A one-page fictional CV with the Candidate's name as its largest text.
function cvOf(name: string): Uint8Array {
  return makePdf([
    [
      { text: name, size: 24 },
      { text: "Built payment services with Node.js and PostgreSQL.", size: 10 },
    ],
  ]);
}

function storedPdfFiles(): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"));
}

describe("Checking a CV before a Candidate is added from it", () => {
  it("reads the name, finds nothing wrong with a new Candidate, and saves nothing", async () => {
    const check = await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") } });

    expect(check).toEqual({ name: "Ece Yalın", status: "ready", refusal: null, alreadyAdded: false });
    expect(core.listCandidates()).toEqual([]);
    expect(storedPdfFiles()).toEqual([]);
  });

  it("reports a PDF with no readable text, a file that is not a PDF, and an empty file, as adding a CV refuses them", async () => {
    const scan = makePdf([[]]);
    const notAPdf = new TextEncoder().encode("Ece Yalın, Backend Engineer");

    const checks = [
      await core.checkCandidateCv({ role, cv: { fileName: "Ece_Yalin.pdf", bytes: scan } }),
      await core.checkCandidateCv({ role, cv: { fileName: "Ece_Yalin.txt", bytes: notAPdf } }),
      await core.checkCandidateCv({ role, cv: { fileName: "Ece_Yalin.pdf", bytes: new Uint8Array() } }),
    ];

    expect(checks.map((check) => check.refusal)).toEqual(["readableText", "format", "required"]);
    expect(checks.map((check) => check.status)).toEqual(["refused", "refused", "refused"]);
  });

  it("gives one status per CV, so the interface decides nothing: a refusal comes before a missing name, and a missing name before a Candidate already in the app", async () => {
    core.createCandidate({ name: "Ece Yalın", role });
    const noName = makePdf([[{ text: "Built payment services with Node.js and PostgreSQL since 2019.", size: 10 }]]);

    const statuses = [
      (await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: cvOf("Ada Demir") } })).status,
      (await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: noName } })).status,
      (await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") } })).status,
      (await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: makePdf([[]]) }, name: "Ece Yalın" })).status,
      (await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") }, name: " " })).status,
    ];

    expect(statuses).toEqual(["ready", "needsName", "alreadyAdded", "refused", "needsName"]);
  });

  it("gives an empty name when none can be read from the CV", async () => {
    const cv = makePdf([[{ text: "Built payment services with Node.js and PostgreSQL since 2019.", size: 10 }]]);

    const check = await core.checkCandidateCv({ role, cv: { fileName: "CV.pdf", bytes: cv } });

    expect(check).toEqual({ name: "", status: "needsName", refusal: null, alreadyAdded: false });
  });

  it("reads the name from a profile export laid out in two columns, with contact details first", async () => {
    // The shape of a profile saved as a PDF from a professional network: a side column of small
    // text comes first in the file, and the name is the largest text in the main column.
    const bytes = makePdf([
      [
        { text: "Contact", size: 13 },
        { text: "ece.yalin@example.com", size: 10 },
        { text: "Top Skills", size: 13 },
        { text: "Node.js", size: 10 },
        { text: "Ece Yalın", size: 26 },
        { text: "Backend Engineer at Örnek Yazılım", size: 12 },
        { text: "Experience", size: 16 },
      ],
    ]);

    const check = await core.checkCandidateCv({ role, cv: { fileName: "Profile.pdf", bytes } });

    expect(check.name).toBe("Ece Yalın");
  });

  it("reads a name that is followed by a note in brackets, such as pronouns, without the note", async () => {
    for (const line of ["Ece Yalın (She/Her)", "Ece Yalın (O)", "Ece Yalın, PMP (2nd)"]) {
      const bytes = makePdf([[{ text: line, size: 26 }, { text: "Backend Engineer", size: 12 }]]);

      const check = await core.checkCandidateCv({ role, cv: { fileName: "Profile.pdf", bytes } });

      expect(check.name, line).toBe(line.startsWith("Ece Yalın,") ? "Ece Yalın, PMP" : "Ece Yalın");
    }
  });

  it("never takes the name from the file name: a CV with no name in it gets an empty name", async () => {
    // The largest text is not a name, and the file is named like one.
    const bytes = makePdf([[{ text: "ornek@example.com | 2019 - 2025", size: 14 }]]);

    const check = await core.checkCandidateCv({ role, cv: { fileName: "Ece_Yalin_CV.pdf", bytes } });

    expect(check).toEqual({ name: "", status: "needsName", refusal: null, alreadyAdded: false });
  });

  it("marks a CV whose name and role a Candidate in the app already has, whatever the letter case and spacing", async () => {
    core.createCandidate({ name: "Işıl  Demir", role: "Kıdemli Backend Mühendisi" });

    const check = await core.checkCandidateCv({
      role: "KIDEMLİ  BACKEND MÜHENDİSİ",
      cv: { fileName: "cv.pdf", bytes: cvOf("IŞIL DEMİR") },
    });

    expect(check).toEqual({ name: "IŞIL DEMİR", status: "alreadyAdded", refusal: null, alreadyAdded: true });
  });

  it("does not mark the same name under another role, or another name under the same role", async () => {
    core.createCandidate({ name: "Ece Yalın", role });

    const otherRole = await core.checkCandidateCv({ role: "Frontend Engineer", cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") } });
    const otherName = await core.checkCandidateCv({ role, cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalınkaya") } });

    expect([otherRole.alreadyAdded, otherName.alreadyAdded]).toEqual([false, false]);
  });

  it("checks the name the Interviewer typed instead of the one read, and an emptied name stays empty", async () => {
    core.createCandidate({ name: "Ada Demir", role });
    const cv = { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") };

    expect(await core.checkCandidateCv({ role, cv, name: " ada demir " })).toEqual({
      name: "ada demir",
      status: "alreadyAdded",
      refusal: null,
      alreadyAdded: true,
    });
    expect(await core.checkCandidateCv({ role, cv, name: "  " })).toEqual({ name: "", status: "needsName", refusal: null, alreadyAdded: false });
  });

  it("marks nothing while no role is chosen", async () => {
    core.createCandidate({ name: "Ece Yalın", role });

    const check = await core.checkCandidateCv({ role: " ", cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") } });

    expect(check).toEqual({ name: "Ece Yalın", status: "ready", refusal: null, alreadyAdded: false });
  });

  it("marks a Candidate added a moment ago from an earlier file, so the same CV chosen twice is caught", async () => {
    const cv = { fileName: "Ece_Yalin.pdf", bytes: cvOf("Ece Yalın") };
    await core.createCandidateWithCv({ name: (await core.checkCandidateCv({ role, cv })).name, role, cv });

    expect((await core.checkCandidateCv({ role, cv })).alreadyAdded).toBe(true);
  });

  it("refuses to add a Candidate already in the app when asked to add only a new one, and saves nothing", async () => {
    // Two files of the same person, both checked before either was added, are both marked ready.
    const first = { fileName: "Ece_Yalin.pdf", bytes: cvOf("Ece Yalın") };
    const second = { fileName: "Ece_Yalin (1).pdf", bytes: cvOf("Ece Yalın") };
    await core.createCandidateWithCv({ name: "Ece Yalın", role, cv: first, onlyIfNew: true });

    const refused = core.createCandidateWithCv({ name: "ECE  YALIN", role: "backend engineer", cv: second, onlyIfNew: true });

    await expect(refused).rejects.toMatchObject({ reason: "candidateExists" });
    expect(core.listCandidates()).toHaveLength(1);
    expect(storedPdfFiles()).toHaveLength(1);
  });

  it("adds a Candidate already in the app when the Interviewer chose to add them anyway", async () => {
    const cv = { fileName: "Ece_Yalin.pdf", bytes: cvOf("Ece Yalın") };
    await core.createCandidateWithCv({ name: "Ece Yalın", role, cv });

    await core.createCandidateWithCv({ name: "Ece Yalın", role, cv, onlyIfNew: false });

    expect(core.listCandidates()).toHaveLength(2);
  });
});

describe("Adding many Candidates from their CVs", () => {
  const firstNames = ["Ada", "Ece", "Can", "Deniz", "Efe", "Lale", "Mert", "Nil", "Ozan", "Selin"];
  const lastNames = ["Demir", "Yalın", "Kara", "Aksoy", "Toprak", "Güneş", "Çelik", "Öztürk", "Şahin", "Yıldız"];
  const names = firstNames.flatMap((first) => lastNames.map((last) => `${first} ${last}`));

  it("adds a hundred fictional CVs for one role with no typed name; three bad files do not stop the others", async () => {
    core.addRoleQuestion({ role, text: "How do you make a payment job idempotent?" });
    const files = [
      { fileName: "scan.pdf", bytes: makePdf([[]]) },
      { fileName: "notes.txt", bytes: new TextEncoder().encode("Not a PDF.") },
      { fileName: "CV.pdf", bytes: makePdf([[{ text: "Experience: 2019 to 2024, payment services.", size: 10 }]]) },
      ...names.map((name, i) => ({ fileName: `cv-${i + 1}.pdf`, bytes: cvOf(name) })),
    ];

    // What the interface does: check each file, then add the ones that are ready, one at a time.
    const notAdded: string[] = [];
    for (const cv of files) {
      const check = await core.checkCandidateCv({ role: "backend engineer", cv });
      if (check.status !== "ready") notAdded.push(cv.fileName);
      else await core.createCandidateWithCv({ name: check.name, role: "backend engineer", cv });
    }

    expect(notAdded).toEqual(["scan.pdf", "notes.txt", "CV.pdf"]);
    const added = core.listCandidates();
    expect(added.map((candidate) => candidate.name).sort()).toEqual([...names].sort());
    // The role keeps the spelling it was first written with, so a search by role finds them all.
    expect(new Set(added.map((candidate) => candidate.role))).toEqual(new Set([role]));
    for (const candidate of added) {
      expect(core.getCv(candidate.id)?.pages[0]?.text).toContain(candidate.name);
      expect(core.listSavedQuestions(candidate.id).map((q) => [q.text, q.origin])).toEqual([
        ["How do you make a payment job idempotent?", "role"],
      ]);
    }
  });
});
