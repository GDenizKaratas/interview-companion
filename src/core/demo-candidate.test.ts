import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

  it.each([
    { today: "2026-11-10", first: "2026-11-03", second: "2026-11-13" },
    { today: "2026-12-30", first: "2026-12-23", second: "2027-01-02" },
    { today: "2028-03-03", first: "2028-02-25", second: "2028-03-06" },
  ])("has one Interview that has taken place and one that is Planned when loaded on $today", ({ today, first, second }) => {
    core.close();
    core = openCore(dbPath, { today: () => today });

    const demo = core.loadDemoCandidate();

    expect(contentOf(demo.id).interviews).toEqual([
      { number: 1, date: first, planned: false },
      { number: 2, date: second, planned: true },
    ]);
  });
});

describe("Demo Candidate on the first start", () => {
  it("loads the demo Candidate when the app starts for the first time with no Candidates", () => {
    const demo = core.loadDemoCandidateOnFirstStart();

    expect(demo).toBeDefined();
    expect(core.listCandidates()).toEqual([demo]);
  });

  it("loads nothing when the Interviewer already has Candidates", () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    expect(core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([own]);
  });

  it("does not bring the demo Candidate back on a later start after it was deleted", () => {
    const demo = core.loadDemoCandidateOnFirstStart()!;
    core.deleteCandidate(demo.id);
    core.close();

    core = openCore(dbPath);

    expect(core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("does not load the demo Candidate later when the Interviewer deletes all of their own Candidates", () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    core.loadDemoCandidateOnFirstStart();
    core.deleteCandidate(own.id);
    core.close();

    core = openCore(dbPath);

    expect(core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("still loads the demo Candidate when asked for by the demo command", () => {
    const demo = core.loadDemoCandidateOnFirstStart()!;
    core.deleteCandidate(demo.id);

    expect(core.loadDemoCandidate()).toEqual(expect.objectContaining({ name: demo.name }));
  });

  it("does not load the demo Candidate into an empty database that an earlier version of the app created", () => {
    core.close();
    // Earlier versions kept nothing in the setting table except the interface language.
    const earlier = new DatabaseSync(dbPath);
    earlier.exec("DELETE FROM setting");
    earlier.close();

    core = openCore(dbPath);

    expect(core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("does not load the demo Candidate on the first start after the demo command loaded it and it was deleted", () => {
    const demo = core.loadDemoCandidate();
    core.deleteCandidate(demo.id);

    expect(core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });
});
