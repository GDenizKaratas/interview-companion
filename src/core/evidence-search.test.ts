import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Candidate, type Core, type Interview } from "./index.ts";
import { makePdf } from "./testing/make-pdf.ts";

let dir: string;
let core: Core;
let candidate: Candidate;
let first: Interview;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10", now: () => new Date("2026-11-10T09:30:00Z") });
  candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

function importText(interviewId: string, lines: string[]) {
  return core.importTranscript(interviewId, { fileName: "t.txt", bytes: new TextEncoder().encode(lines.join("\n")) });
}

// Gives each speaker label its role and confirms the Speaker Mapping.
function confirmRoles(interviewId: string, roles: Record<string, "candidate" | "interviewer" | "other">) {
  const transcript = core.getTranscript(interviewId)!;
  core.confirmSpeakerMapping(
    interviewId,
    Object.fromEntries(transcript.speakers.map((speaker) => [speaker.id, roles[speaker.label]!])),
  );
}

// A two-page CV: Redis on page 1 and on page 2.
const cv = makePdf([
  [
    { text: "Ece Yalın", size: 24 },
    { text: "Node.js, PostgreSQL, Redis ve BullMQ ile ödeme servisleri.", size: 10 },
    { text: "Kod incelemesi ve test.", size: 10 },
  ],
  [{ text: "Sertifika: Redis Geliştirici", size: 10 }],
]);

describe("Evidence search in the CV", () => {
  it("returns the line with the match and its page, and says the term is in both the CV and the Interview", async () => {
    await core.attachCv(candidate.id, { fileName: "cv.pdf", bytes: cv });
    importText(first.id, ["Ece: Redis ile BullMQ kullandık."]);

    const search = core.searchEvidence(candidate.id, { query: "redis", sources: "all", candidateOnly: false });

    expect(search.results.filter((result) => result.source === "cv")).toEqual([
      {
        source: "cv",
        page: 1,
        excerpt: "Node.js, PostgreSQL, Redis ve BullMQ ile ödeme servisleri.",
        highlights: [{ start: 21, end: 26 }],
      },
      { source: "cv", page: 2, excerpt: "Sertifika: Redis Geliştirici", highlights: [{ start: 11, end: 16 }] },
    ]);
    expect(search.results.map((result) => result.source)).toEqual(["cv", "cv", "transcript"]);
    expect(search.foundIn).toEqual({ cv: true, interviewIds: [first.id] });
  });

  it("searches only the sources asked for", async () => {
    await core.attachCv(candidate.id, { fileName: "cv.pdf", bytes: cv });
    importText(first.id, ["Ece: Redis ile BullMQ kullandık."]);

    const sourcesOf = (sources: "cv" | "transcripts") =>
      core.searchEvidence(candidate.id, { query: "Redis", sources, candidateOnly: false }).results.map((r) => r.source);

    expect(sourcesOf("cv")).toEqual(["cv", "cv"]);
    expect(sourcesOf("transcripts")).toEqual(["transcript"]);
  });
});

describe("Evidence search in Transcripts", () => {
  it("finds what the Interviewer said, but nothing when limited to what the Candidate said", () => {
    importText(first.id, ["Ayşe: Redis kullandınız mı?", "Ece: Hayır, sadece PostgreSQL."]);
    confirmRoles(first.id, { Ayşe: "interviewer", Ece: "candidate" });

    const everyone = core.searchEvidence(candidate.id, { query: "Redis", sources: "transcripts", candidateOnly: false });
    expect(everyone.results).toEqual([
      {
        source: "transcript",
        interviewId: first.id,
        segmentNumber: 1,
        speakerLabel: "Ayşe",
        speakerRole: "interviewer",
        startMs: null,
        endMs: null,
        excerpt: "Redis kullandınız mı?",
        highlights: [{ start: 0, end: 5 }],
      },
    ]);

    const candidateOnly = core.searchEvidence(candidate.id, { query: "Redis", sources: "transcripts", candidateOnly: true });
    expect(candidateOnly.results).toEqual([]);
    expect(candidateOnly.foundIn).toEqual({ cv: false, interviewIds: [] });
  });

  it("finds a word with a Turkish suffix or in capitals: \"Redis\" finds \"Redis'i\" and \"REDİS\"", () => {
    importText(first.id, [
      "Ece: Redis'i kuyruk için seçtik.",
      "Ece: REDİS KÜMESİ üç düğümdü.",
      "Ece: Predis adlı istemciyi kullanmadık.",
    ]);

    const search = core.searchEvidence(candidate.id, { query: "Redis", sources: "all", candidateOnly: false });

    expect(search.results.map((result) => [result.excerpt, result.highlights])).toEqual([
      ["Redis'i kuyruk için seçtik.", [{ start: 0, end: 5 }]],
      ["REDİS KÜMESİ üç düğümdü.", [{ start: 0, end: 5 }]],
    ]);
  });

  it("matches Turkish capitals letter by letter: I stands for ı or i, İ only for i", () => {
    importText(first.id, ["Ece: ILIK bir geçişti.", "Ece: İLİK değil.", "Ece: Kullanıcılar memnundu."]);

    const ilik = (query: string) =>
      core.searchEvidence(candidate.id, { query, sources: "all", candidateOnly: false }).results.map((r) => r.excerpt);

    expect(ilik("ılık")).toEqual(["ILIK bir geçişti."]);
    expect(ilik("ilik")).toEqual(["ILIK bir geçişti.", "İLİK değil."]);
    expect(ilik("KULLANICI")).toEqual(["Kullanıcılar memnundu."]);
  });

  it("finds several words in a row, each with its own suffix", () => {
    importText(first.id, ["Ece: Ödemeleri servisler arasında böldük.", "Ece: Servis ödemesi ayrıydı."]);

    const search = core.searchEvidence(candidate.id, { query: "ödeme servis", sources: "all", candidateOnly: false });

    expect(search.results.map((result) => [result.excerpt, result.highlights])).toEqual([
      ["Ödemeleri servisler arasında böldük.", [{ start: 0, end: 19 }]],
    ]);
  });

  it("leaves out Transcripts whose Speaker Mapping is not confirmed when limited to the Candidate, and names them", () => {
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });
    importText(first.id, ["Ece: Redis kullandık."]);
    importText(second.id, ["Ece: Redis kümesini ben kurdum."]);
    confirmRoles(second.id, { Ece: "candidate" });

    const search = core.searchEvidence(candidate.id, { query: "Redis", sources: "all", candidateOnly: true });

    expect(search.results.map((result) => result.excerpt)).toEqual(["Redis kümesini ben kurdum."]);
    expect(search.foundIn).toEqual({ cv: false, interviewIds: [second.id] });
    expect(search.unconfirmedInterviewIds).toEqual([first.id]);
  });
});

describe("Nothing found", () => {
  it("returns no results for an absent term, in the CV and in Transcripts", async () => {
    await core.attachCv(candidate.id, { fileName: "cv.pdf", bytes: cv });
    importText(first.id, ["Ayşe: Redis kullandınız mı?", "Ece: Evet."]);

    for (const sources of ["cv", "transcripts", "all"] as const) {
      const search = core.searchEvidence(candidate.id, { query: "Kubernetes", sources, candidateOnly: false });
      expect(search.results).toEqual([]);
      expect(search.foundIn).toEqual({ cv: false, interviewIds: [] });
    }
  });

  it("returns no results when the Candidate has no CV and no Transcript yet", () => {
    const search = core.searchEvidence(candidate.id, { query: "Redis", sources: "all", candidateOnly: false });

    expect(search).toEqual({ results: [], foundIn: { cv: false, interviewIds: [] }, unconfirmedInterviewIds: [] });
  });

  it("refuses a search with no word in it", () => {
    for (const query of ["", "   ", "'-?"]) {
      expect(() => core.searchEvidence(candidate.id, { query, sources: "all", candidateOnly: false })).toThrow(
        expect.objectContaining({ field: "search", rule: "required" }),
      );
    }
  });

  it("refuses sources other than all, cv, or transcripts", () => {
    expect(() =>
      core.searchEvidence(candidate.id, { query: "Redis", sources: "notes" as "all", candidateOnly: false }),
    ).toThrow(expect.objectContaining({ field: "sources", rule: "format" }));
  });

  it("refuses a search for a Candidate that does not exist", () => {
    expect(() => core.searchEvidence("no-such-id", { query: "Redis", sources: "all", candidateOnly: false })).toThrow(
      NotFoundError,
    );
  });
});
