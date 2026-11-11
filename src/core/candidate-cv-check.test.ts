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

    expect(check).toEqual({ name: "Ece Yalın", refusal: null, alreadyAdded: false });
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
  });

  it("gives an empty name when none can be read from the CV or its file name", async () => {
    const cv = makePdf([[{ text: "Built payment services with Node.js and PostgreSQL since 2019.", size: 10 }]]);

    const check = await core.checkCandidateCv({ role, cv: { fileName: "CV.pdf", bytes: cv } });

    expect(check).toEqual({ name: "", refusal: null, alreadyAdded: false });
  });

  it("marks a CV whose name and role a Candidate in the app already has, whatever the letter case and spacing", async () => {
    core.createCandidate({ name: "Işıl  Demir", role: "Kıdemli Backend Mühendisi" });

    const check = await core.checkCandidateCv({
      role: "KIDEMLİ  BACKEND MÜHENDİSİ",
      cv: { fileName: "cv.pdf", bytes: cvOf("IŞIL DEMİR") },
    });

    expect(check).toEqual({ name: "IŞIL DEMİR", refusal: null, alreadyAdded: true });
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
      refusal: null,
      alreadyAdded: true,
    });
    expect(await core.checkCandidateCv({ role, cv, name: "  " })).toEqual({ name: "", refusal: null, alreadyAdded: false });
  });

  it("marks nothing while no role is chosen", async () => {
    core.createCandidate({ name: "Ece Yalın", role });

    const check = await core.checkCandidateCv({ role: " ", cv: { fileName: "cv.pdf", bytes: cvOf("Ece Yalın") } });

    expect(check).toEqual({ name: "Ece Yalın", refusal: null, alreadyAdded: false });
  });

  it("marks a Candidate added a moment ago from an earlier file, so the same CV chosen twice is caught", async () => {
    const cv = { fileName: "Ece_Yalin.pdf", bytes: cvOf("Ece Yalın") };
    await core.createCandidateWithCv({ name: (await core.checkCandidateCv({ role, cv })).name, role, cv });

    expect((await core.checkCandidateCv({ role, cv })).alreadyAdded).toBe(true);
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
      if (check.refusal !== null || check.name === "" || check.alreadyAdded) notAdded.push(cv.fileName);
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
