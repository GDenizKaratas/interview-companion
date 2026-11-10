import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Core } from "./index.ts";
import { makePdf } from "./testing/make-pdf.ts";

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

// Every PDF file stored anywhere next to the database.
function storedPdfFiles(): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"));
}

// A two-page CV with a text layer.
const cvWithText = makePdf([
  [
    { text: "Ece Yalın", size: 24 },
    { text: "Backend Engineer", size: 14 },
    { text: "Built payment services with Node.js and PostgreSQL.", size: 10 },
  ],
  [{ text: "Hobiler: dağ yürüyüşü, satranç", size: 10 }],
]);

// A one-page CV with no text at all, like a scan.
const cvWithoutText = makePdf([[]]);

describe("CV", () => {
  it("stores a CV's text page by page and keeps the file", async () => {
    const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });

    await core.attachCv(candidate.id, { fileName: "Ece_Yalin_CV.pdf", bytes: cvWithText });

    const cv = core.getCv(candidate.id);
    expect(cv?.fileName).toBe("Ece_Yalin_CV.pdf");
    expect(cv?.pages.map((page) => page.number)).toEqual([1, 2]);
    expect(cv?.pages[0]?.text).toContain("Built payment services with Node.js and PostgreSQL.");
    expect(cv?.pages[1]?.text).toContain("Hobiler: dağ yürüyüşü, satranç");
    expect(core.readCvFile(candidate.id)?.bytes).toEqual(cvWithText);
  });

  it("refuses a PDF with no text and stores nothing", async () => {
    const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });

    await expect(core.attachCv(candidate.id, { fileName: "scan.pdf", bytes: cvWithoutText })).rejects.toThrow(
      expect.objectContaining({ field: "cv", rule: "readableText" }),
    );

    expect(core.getCv(candidate.id)).toBeUndefined();
    expect(core.readCvFile(candidate.id)).toBeUndefined();
    expect(storedPdfFiles()).toEqual([]);
  });

  it("refuses a file that is not a PDF", async () => {
    const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
    const notAPdf = new TextEncoder().encode("Ece Yalın, Backend Engineer");

    await expect(core.attachCv(candidate.id, { fileName: "cv.txt", bytes: notAPdf })).rejects.toThrow(
      expect.objectContaining({ field: "cv", rule: "format" }),
    );
    expect(core.getCv(candidate.id)).toBeUndefined();
  });

  it("replaces the old CV's file and text when a new CV is uploaded", async () => {
    const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
    await core.attachCv(candidate.id, { fileName: "old.pdf", bytes: cvWithText });
    const newCv = makePdf([[{ text: "Ece Yalın", size: 24 }, { text: "Now leads the platform team.", size: 10 }]]);

    await core.attachCv(candidate.id, { fileName: "new.pdf", bytes: newCv });

    const cv = core.getCv(candidate.id);
    expect(cv?.fileName).toBe("new.pdf");
    expect(cv?.pages).toEqual([{ number: 1, text: "Ece Yalın\nNow leads the platform team." }]);
    expect(core.readCvFile(candidate.id)?.bytes).toEqual(newCv);
    expect(storedPdfFiles()).toHaveLength(1);
  });

  it("keeps the old CV when the new one is refused", async () => {
    const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
    await core.attachCv(candidate.id, { fileName: "old.pdf", bytes: cvWithText });

    await expect(core.attachCv(candidate.id, { fileName: "scan.pdf", bytes: cvWithoutText })).rejects.toThrow();

    expect(core.getCv(candidate.id)?.fileName).toBe("old.pdf");
    expect(core.readCvFile(candidate.id)?.bytes).toEqual(cvWithText);
  });

  it("refuses a CV for a Candidate that does not exist", async () => {
    await expect(core.attachCv("no-such-id", { fileName: "cv.pdf", bytes: cvWithText })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("Adding a Candidate with a CV", () => {
  it("creates the Candidate and attaches the CV in one step", async () => {
    const candidate = await core.createCandidateWithCv({
      name: "Ece Yalın",
      role: "Backend Engineer",
      cv: { fileName: "Ece_Yalin_CV.pdf", bytes: cvWithText },
    });

    expect(core.listCandidates()).toEqual([candidate]);
    expect(core.getCv(candidate.id)?.fileName).toBe("Ece_Yalin_CV.pdf");
  });

  it("creates no Candidate when the CV is refused", async () => {
    await expect(
      core.createCandidateWithCv({
        name: "Ece Yalın",
        role: "Backend Engineer",
        cv: { fileName: "scan.pdf", bytes: cvWithoutText },
      }),
    ).rejects.toThrow(expect.objectContaining({ field: "cv", rule: "readableText" }));

    expect(core.listCandidates()).toEqual([]);
  });

  it("still needs a name and a role, and then stores no CV file", async () => {
    await expect(
      core.createCandidateWithCv({ name: " ", role: "Backend Engineer", cv: { fileName: "cv.pdf", bytes: cvWithText } }),
    ).rejects.toThrow(expect.objectContaining({ field: "name", rule: "required" }));

    expect(core.listCandidates()).toEqual([]);
    expect(storedPdfFiles()).toEqual([]);
  });
});

describe("Guessing the Candidate's name from a CV", () => {
  it("guesses the largest text on the first page", async () => {
    const cv = makePdf([
      [
        { text: "Backend Engineer", size: 14 },
        { text: "Ece Yalın", size: 26 },
        { text: "İstanbul · ece@example.com", size: 10 },
      ],
      [{ text: "A much larger line on page two", size: 40 }],
    ]);

    expect(await core.guessCandidateName({ fileName: "cv.pdf", bytes: cv })).toBe("Ece Yalın");
  });

  it.each(["CURRICULUM VITAE", "Resume", "Résumé", "CV", "ÖZGEÇMİŞ", "Özgeçmiş", "CV / Özgeçmiş"])(
    'never guesses the heading "%s", and takes the largest text after it',
    async (heading) => {
      const cv = makePdf([
        [
          { text: heading, size: 30 },
          { text: "Ece Yalın", size: 20 },
          { text: "Backend Engineer", size: 14 },
        ],
      ]);

      expect(await core.guessCandidateName({ fileName: "cv.pdf", bytes: cv })).toBe("Ece Yalın");
    },
  );

  it("falls back to the file name when the PDF has no text", async () => {
    expect(await core.guessCandidateName({ fileName: "Ada_Demir_CV.pdf", bytes: cvWithoutText })).toBe("Ada Demir");
  });

  it("falls back to the file name when the file cannot be opened as a PDF", async () => {
    const notAPdf = new TextEncoder().encode("not a pdf");

    expect(await core.guessCandidateName({ fileName: "ada-demir-ozgecmis.pdf", bytes: notAPdf })).toBe("ada demir");
  });

  it("falls back to the file name when the largest text does not look like a name", async () => {
    const cv = makePdf([
      [
        { text: "ece.yalin@example.com", size: 22 },
        { text: "Backend Engineer", size: 14 },
      ],
    ]);

    expect(await core.guessCandidateName({ fileName: "Ece Yalın - Resume 2026 v3.pdf", bytes: cv })).toBe("Ece Yalın");
  });

  it("guesses nothing when the file name is only a heading", async () => {
    expect(await core.guessCandidateName({ fileName: "CV.pdf", bytes: cvWithoutText })).toBe("");
  });
});

describe("The demo CV", () => {
  it("is a readable fictional CV whose name is guessed correctly", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("../../demo/cv.pdf", import.meta.url)));
    const candidate = core.createCandidate({ name: "Deniz Yılmaz", role: "Kıdemli Backend Mühendisi" });

    await core.attachCv(candidate.id, { fileName: "cv.pdf", bytes });

    expect(await core.guessCandidateName({ fileName: "cv.pdf", bytes })).toBe("Deniz Yılmaz");
    expect(core.getCv(candidate.id)?.pages[0]?.text).toContain("Redis ve BullMQ");
  });
});
