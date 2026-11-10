import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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
  it("loads a Candidate with Interviews, Interviewer Notes, and Saved Questions", async () => {
    const demo = await core.loadDemoCandidate();

    expect(core.listCandidates()).toEqual([demo]);
    const content = contentOf(demo.id);
    expect(content.interviews.length).toBeGreaterThan(0);
    expect(content.notes.length).toBeGreaterThan(0);
    expect(content.notes.some((note) => note.interview !== null)).toBe(true);
    expect(content.questions.length).toBeGreaterThan(0);
  });

  it("does not create duplicates when it is loaded twice", async () => {
    const first = await core.loadDemoCandidate();
    const firstContent = contentOf(first.id);

    const second = await core.loadDemoCandidate();

    expect(core.listCandidates()).toEqual([second]);
    expect(contentOf(second.id)).toEqual(firstContent);
  });

  it("replaces changes made to the demo Candidate with a fresh copy, and leaves other Candidates alone", async () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    core.addSavedQuestion({ candidateId: own.id, text: "My own question?" });
    const demo = await core.loadDemoCandidate();
    const fresh = contentOf(demo.id);
    core.addSavedQuestion({ candidateId: demo.id, text: "Added while exploring?" });
    core.deleteInterviewerNote(core.listInterviewerNotes(demo.id)[0]!.id);

    const reloaded = await core.loadDemoCandidate();

    expect(contentOf(reloaded.id)).toEqual(fresh);
    expect(core.listCandidates().map((c) => c.id).sort()).toEqual([own.id, reloaded.id].sort());
    expect(core.listSavedQuestions(own.id).map((q) => q.text)).toEqual(["My own question?"]);
  });

  it("loads again after the demo Candidate was deleted", async () => {
    const demo = await core.loadDemoCandidate();
    const fresh = contentOf(demo.id);
    core.deleteCandidate(demo.id);

    const reloaded = await core.loadDemoCandidate();

    expect(contentOf(reloaded.id)).toEqual(fresh);
  });

  it.each([
    { today: "2026-11-10", first: "2026-11-03", second: "2026-11-13" },
    { today: "2026-12-30", first: "2026-12-23", second: "2027-01-02" },
    { today: "2028-03-03", first: "2028-02-25", second: "2028-03-06" },
  ])("has one Interview that has taken place and one that is Planned when loaded on $today", async ({ today, first, second }) => {
    core.close();
    core = openCore(dbPath, { today: () => today });

    const demo = await core.loadDemoCandidate();

    expect(contentOf(demo.id).interviews).toEqual([
      { number: 1, date: first, planned: false },
      { number: 2, date: second, planned: true },
    ]);
  });
  it("gives the demo Candidate the fictional demo CV", async () => {
    const demo = await core.loadDemoCandidate();

    const cv = core.getCv(demo.id);
    expect(cv?.pages).toHaveLength(2);
    expect(cv?.pages[0]?.text).toContain("Deniz Yılmaz");
    expect(cv?.pages[0]?.text).toContain("Redis ve BullMQ");
  });

  it("gives the First Interview a fictional Turkish Transcript, imported from the demo file, and leaves the Planned one without", async () => {
    const demo = await core.loadDemoCandidate();
    const [first, second] = core.listInterviews(demo.id);

    const transcript = core.getTranscript(first!.id);
    expect(transcript?.fileName).toBe("transcript-first-interview.txt");
    expect(transcript?.speakers.map((speaker) => [speaker.label, speaker.verified])).toEqual([
      ["Ayşe", false],
      ["Deniz", false],
    ]);
    expect(transcript?.segments.some((segment) => segment.text.includes("BullMQ"))).toBe(true);
    expect(core.getTranscript(second!.id)).toBeUndefined();
  });

  it("keeps one CV file when the demo is loaded again", async () => {
    await core.loadDemoCandidate();
    await core.loadDemoCandidate();

    expect(readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"))).toHaveLength(1);
  });
});

describe("Demo Candidate on the first start", () => {
  it("loads the demo Candidate when the app starts for the first time with no Candidates", async () => {
    const demo = await core.loadDemoCandidateOnFirstStart();

    expect(demo).toBeDefined();
    expect(core.listCandidates()).toEqual([demo]);
  });

  it("loads nothing when the Interviewer already has Candidates", async () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    expect(await core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([own]);
  });

  it("does not bring the demo Candidate back on a later start after it was deleted", async () => {
    const demo = (await core.loadDemoCandidateOnFirstStart())!;
    core.deleteCandidate(demo.id);
    core.close();

    core = openCore(dbPath);

    expect(await core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("does not load the demo Candidate later when the Interviewer deletes all of their own Candidates", async () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    await core.loadDemoCandidateOnFirstStart();
    core.deleteCandidate(own.id);
    core.close();

    core = openCore(dbPath);

    expect(await core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("still loads the demo Candidate when asked for by the demo command", async () => {
    const demo = (await core.loadDemoCandidateOnFirstStart())!;
    core.deleteCandidate(demo.id);

    expect(await core.loadDemoCandidate()).toEqual(expect.objectContaining({ name: demo.name }));
  });

  it("does not load the demo Candidate into an empty database that an earlier version of the app created", async () => {
    core.close();
    // Earlier versions kept nothing in the setting table except the interface language.
    const earlier = new DatabaseSync(dbPath);
    earlier.exec("DELETE FROM setting");
    earlier.close();

    core = openCore(dbPath);

    expect(await core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });

  it("does not load the demo Candidate on the first start after the demo command loaded it and it was deleted", async () => {
    const demo = await core.loadDemoCandidate();
    core.deleteCandidate(demo.id);

    expect(await core.loadDemoCandidateOnFirstStart()).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
  });
});

describe("Demo set", () => {
  it("loads five fictional Candidates with different roles, the demo Candidate among them", async () => {
    const own = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    const demos = await core.loadDemoCandidates();

    expect(demos).toHaveLength(5);
    expect(new Set(demos.map((c) => c.role)).size).toBe(5);
    expect(demos.map((c) => c.name)).toContain("Deniz Yılmaz");
    expect(core.listCandidates().map((c) => c.id).sort()).toEqual([own.id, ...demos.map((c) => c.id)].sort());
  });

  it("gives the set past, Planned, and undated Interviews, so a calendar has something to show", async () => {
    const demos = await core.loadDemoCandidates();

    const interviews = demos.flatMap((c) => core.listInterviews(c.id));
    expect(interviews.filter((i) => i.planned).length).toBeGreaterThanOrEqual(3);
    expect(interviews.filter((i) => i.date !== null && !i.planned).length).toBeGreaterThanOrEqual(3);
    expect(interviews.some((i) => i.date === null)).toBe(true);
  });

  it("includes a CV-less Candidate, a WebVTT Transcript with times, and a Transcript whose Speaker Mapping is confirmed", async () => {
    const demos = await core.loadDemoCandidates();

    expect(demos.some((c) => core.getCv(c.id) === undefined)).toBe(true);
    const transcripts = demos
      .flatMap((c) => core.listInterviews(c.id))
      .map((i) => core.getTranscript(i.id))
      .filter((t) => t !== undefined);
    expect(transcripts.some((t) => t.format === "webvtt" && t.segments.every((s) => s.startMs !== null))).toBe(true);
    expect(transcripts.some((t) => t.speakerMappingConfirmedAt !== null)).toBe(true);
    expect(transcripts.some((t) => t.speakerMappingConfirmedAt === null)).toBe(true);
  });

  it("replaces the set with a fresh copy when loaded again, without duplicates or leftover CV files", async () => {
    const first = await core.loadDemoCandidates();
    const before = first.map((c) => contentOf(c.id));
    core.addSavedQuestion({ candidateId: first[1]!.id, text: "Added while exploring?" });

    const second = await core.loadDemoCandidates();

    expect(second.map((c) => contentOf(c.id))).toEqual(before);
    expect(core.listCandidates()).toHaveLength(5);
    const cvCount = second.filter((c) => core.getCv(c.id) !== undefined).length;
    expect(readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"))).toHaveLength(cvCount);
  });

  it("leaves no CV file behind when a CV was added to a demo Candidate without one and the set is loaded again", async () => {
    const first = await core.loadDemoCandidates();
    const withoutCv = first.find((c) => core.getCv(c.id) === undefined)!;
    await core.attachCv(withoutCv.id, { fileName: "cv.pdf", bytes: new Uint8Array(readFileSync(new URL("../../demo/cv.pdf", import.meta.url))) });

    const second = await core.loadDemoCandidates();

    const cvCount = second.filter((c) => core.getCv(c.id) !== undefined).length;
    expect(readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"))).toHaveLength(cvCount);
  });

  it("gives three past Interviews a full Transcript with confirmed speakers, ready Asked Questions, and AI Notes", async () => {
    const demos = await core.loadDemoCandidates();

    const ready = demos
      .flatMap((c) => core.listInterviews(c.id))
      .filter((i) => core.getTranscript(i.id)?.speakerMappingConfirmedAt);
    expect(ready).toHaveLength(3);
    for (const interview of ready) {
      expect(core.getTranscript(interview.id)!.segments.length).toBeGreaterThanOrEqual(18);
      expect(core.listAskedQuestions(interview.id)).toMatchObject({ stale: false });
      expect(core.listAskedQuestions(interview.id)!.askedQuestions.length).toBeGreaterThanOrEqual(7);
      expect(core.listAiNotes(interview.id).length).toBeGreaterThanOrEqual(4);
      expect(core.listAiNotes(interview.id).every((note) => !note.stale)).toBe(true);
    }
  });

  it("links some Saved Questions to the questions asked and shows others as not found", async () => {
    const demos = await core.loadDemoCandidates();

    const checks = demos.flatMap((c) => core.listSavedQuestionChecks(c.id));
    expect(checks.filter((check) => check.askedQuestion !== null).length).toBeGreaterThanOrEqual(5);
    expect(checks.filter((check) => check.askedQuestion === null).length).toBeGreaterThanOrEqual(3);
  });
});

