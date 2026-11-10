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
  core = openCore(dbPath, { today: () => "2026-11-10" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Everything core shows about a Candidate, without ids and times, which change on every load.
function contentOf(candidateId: string) {
  const candidate = core.getCandidate(candidateId)!;
  const interviews = core.listInterviews(candidateId);
  const numberOf = (interviewId: string | null) => interviews.find((i) => i.id === interviewId)?.number ?? null;
  return {
    name: candidate.name,
    role: candidate.role,
    interviews: interviews.map((i) => ({ number: i.number, date: i.date, planned: i.planned })),
    notes: core.listInterviewerNotes(candidateId).map((n) => ({ text: n.text, interview: numberOf(n.interviewId) })),
    questions: core.listSavedQuestions(candidateId).map((q) => ({ text: q.text, origin: q.origin })),
  };
}

describe("Demo Candidate", () => {
  it("loads a Candidate with Interviews, Interviewer Notes, and Saved Questions", () => {
    const demo = core.loadDemoCandidate();

    expect(core.listCandidates()).toEqual([demo]);
    const content = contentOf(demo.id);
    expect(content.interviews.length).toBeGreaterThan(0);
    expect(content.notes.length).toBeGreaterThan(0);
    expect(content.notes.some((note) => note.interview !== null)).toBe(true);
    expect(content.questions.length).toBeGreaterThan(0);
  });

  it("does not create duplicates when it is loaded twice", () => {
    const first = core.loadDemoCandidate();
    const firstContent = contentOf(first.id);

    const second = core.loadDemoCandidate();

    expect(core.listCandidates()).toEqual([second]);
    expect(contentOf(second.id)).toEqual(firstContent);
  });

  it("replaces changes made to the demo Candidate with a fresh copy, and leaves other Candidates alone", () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    core.addSavedQuestion({ candidateId: own.id, text: "My own question?" });
    const demo = core.loadDemoCandidate();
    const fresh = contentOf(demo.id);
    core.addSavedQuestion({ candidateId: demo.id, text: "Added while exploring?" });
    core.deleteInterviewerNote(core.listInterviewerNotes(demo.id)[0]!.id);

    const reloaded = core.loadDemoCandidate();

    expect(contentOf(reloaded.id)).toEqual(fresh);
    expect(core.listCandidates().map((c) => c.id).sort()).toEqual([own.id, reloaded.id].sort());
    expect(core.listSavedQuestions(own.id).map((q) => q.text)).toEqual(["My own question?"]);
  });

  it("loads again after the demo Candidate was deleted", () => {
    const demo = core.loadDemoCandidate();
    const fresh = contentOf(demo.id);
    core.deleteCandidate(demo.id);

    const reloaded = core.loadDemoCandidate();

    expect(contentOf(reloaded.id)).toEqual(fresh);
  });

  it("has one Interview that has taken place and one that is Planned, whatever day it is loaded", () => {
    const demo = core.loadDemoCandidate();

    expect(contentOf(demo.id).interviews).toEqual([
      { number: 1, date: "2026-11-03", planned: false },
      { number: 2, date: "2026-11-13", planned: true },
    ]);
  });
});
