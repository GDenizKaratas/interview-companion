import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeAiProvider, type FakeAiProvider } from "./testing/fake-ai-provider.ts";
import { AiProviderError, NotFoundError, openCore, type Candidate, type Core, type Interview, type ProposedAskedQuestion, type Transcript } from "./index.ts";

let dir: string;
let core: Core;
let fake: FakeAiProvider;
let candidate: Candidate;
let interview: Interview;
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  clock = new Date("2026-11-10T09:30:00Z");
  fake = fakeAiProvider();
  core = openCore(join(dir, "test.sqlite"), { now: () => clock, aiProvider: fake.factory });
  candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Segments 1 and 3 are the Interviewer, 2 and 4 the Candidate.
const transcriptLines = [
  "Ayşe: Arka plan işlerini nasıl çalıştırdınız?",
  "Ece: Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi.",
  "Ayşe: Ödeme servisini kim yazdı?",
  "Ece: Ödeme servisini ben yazdım.",
];

function importTranscript(lines = transcriptLines): Transcript {
  return core.importTranscript(interview.id, { fileName: "t.txt", bytes: new TextEncoder().encode(lines.join("\n")) });
}

function confirmRoles(transcript: Transcript, candidateLabel = "Ece"): void {
  const roles = Object.fromEntries(
    transcript.speakers.map((speaker) => [speaker.id, speaker.label === candidateLabel ? "candidate" : "interviewer"] as const),
  );
  core.confirmSpeakerMapping(interview.id, roles);
}

function ready(): void {
  core.saveApiKey("sk-ant-test-key");
  confirmRoles(importTranscript());
}

const backgroundJobs: ProposedAskedQuestion = {
  question: "Arka plan işlerini nasıl çalıştırdığı",
  questionEvidence: { segmentNumber: 1, quote: "Arka plan işlerini nasıl çalıştırdınız?" },
  savedQuestionId: null,
  answerSummary: "Redis ile BullMQ kullandıklarını, işlerin üç kez yeniden denendiğini söyledi.",
  answerEvidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }],
};

const payments: ProposedAskedQuestion = {
  question: "Ödeme servisini kimin yazdığı",
  questionEvidence: { segmentNumber: 3, quote: "Ödeme servisini kim yazdı?" },
  savedQuestionId: null,
  answerSummary: "Ödeme servisini kendisinin yazdığını söyledi.",
  answerEvidence: [{ segmentNumber: 4, quote: "ben yazdım" }],
};

describe("Asked Questions", () => {
  it("saves each question the Interviewer asked with its Answer Summary, when every quote is found", async () => {
    ready();
    fake.askedQuestions = [backgroundJobs, payments];

    const result = await core.findAskedQuestions(interview.id);

    const expected = [
      {
        interviewId: interview.id,
        question: "Arka plan işlerini nasıl çalıştırdığı",
        questionEvidence: { segmentNumber: 1, quote: "Arka plan işlerini nasıl çalıştırdınız?" },
        answerSummary: "Redis ile BullMQ kullandıklarını, işlerin üç kez yeniden denendiğini söyledi.",
        answerEvidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }],
        savedQuestionId: null,
        firstSegment: 1,
        lastSegment: 2,
        source: "app",
        stale: false,
      },
      { question: "Ödeme servisini kimin yazdığı", firstSegment: 3, lastSegment: 4 },
    ];
    expect(result.dropped).toBe(0);
    expect(result.askedQuestions).toMatchObject(expected);
    expect(core.listAskedQuestions(interview.id)).toEqual({ foundAt: "2026-11-10T09:30:00.000Z", stale: false, askedQuestions: result.askedQuestions });
  });

  it("drops a question whose quotes are not where they must be, counts it, and keeps the others", async () => {
    ready();
    fake.askedQuestions = [
      backgroundJobs,
      // The question is quoted from the Candidate, not the Interviewer.
      { ...payments, questionEvidence: { segmentNumber: 4, quote: "Ödeme servisini ben yazdım." } },
      // The answer quotes the Interviewer.
      { ...payments, answerEvidence: [{ segmentNumber: 3, quote: "Ödeme servisini kim yazdı?" }] },
      // The answer comes before the question.
      { ...payments, answerEvidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }] },
      // A quote not found word for word.
      { ...payments, answerEvidence: [{ segmentNumber: 4, quote: "ben yazmadım" }] },
      // No answer at all, or no summary.
      { ...payments, answerEvidence: [] },
      { ...payments, answerSummary: "  " },
    ];

    const result = await core.findAskedQuestions(interview.id);

    expect(result.dropped).toBe(6);
    expect(result.askedQuestions.map((q) => q.question)).toEqual(["Arka plan işlerini nasıl çalıştırdığı"]);
  });

  it("sends each segment with its role, the interface language, and the Candidate's Saved Questions", async () => {
    ready();
    const saved = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });

    await core.findAskedQuestions(interview.id);

    expect(fake.askedQuestionRequests).toEqual([
      {
        language: core.getInterfaceLanguage(),
        segments: [
          { number: 1, role: "interviewer", text: "Arka plan işlerini nasıl çalıştırdınız?" },
          { number: 2, role: "candidate", text: "Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi." },
          { number: 3, role: "interviewer", text: "Ödeme servisini kim yazdı?" },
          { number: 4, role: "candidate", text: "Ödeme servisini ben yazdım." },
        ],
        savedQuestions: [{ id: saved.id, text: "Ödeme servisini kim yazdı?" }],
      },
    ]);
  });

  it("links an Asked Question to the Saved Question it matches, and ignores an id the Candidate does not have", async () => {
    ready();
    const saved = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    fake.askedQuestions = [
      { ...backgroundJobs, savedQuestionId: "not-a-saved-question" },
      { ...payments, savedQuestionId: saved.id },
    ];

    const result = await core.findAskedQuestions(interview.id);

    expect(result.askedQuestions.map((q) => q.savedQuestionId)).toEqual([null, saved.id]);
  });

  it("keeps the Asked Question when its Saved Question is deleted, without the link", async () => {
    ready();
    const saved = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    fake.askedQuestions = [{ ...payments, savedQuestionId: saved.id }];
    await core.findAskedQuestions(interview.id);

    core.deleteSavedQuestion(saved.id);

    expect(core.listAskedQuestions(interview.id)?.askedQuestions).toMatchObject([{ question: payments.question, savedQuestionId: null }]);
  });

  it("replaces the Interview's Asked Questions when they are found again", async () => {
    ready();
    fake.askedQuestions = [backgroundJobs, payments];
    await core.findAskedQuestions(interview.id);
    clock = new Date("2026-11-10T10:00:00Z");
    fake.askedQuestions = [payments];

    await core.findAskedQuestions(interview.id);

    expect(core.listAskedQuestions(interview.id)).toMatchObject({
      foundAt: "2026-11-10T10:00:00.000Z",
      askedQuestions: [{ question: payments.question }],
    });
  });

  it("records that no question was found, and keeps the earlier ones when none of the proposed passes", async () => {
    ready();
    fake.askedQuestions = [];
    expect(await core.findAskedQuestions(interview.id)).toEqual({ askedQuestions: [], dropped: 0 });
    expect(core.listAskedQuestions(interview.id)).toMatchObject({ askedQuestions: [] });

    fake.askedQuestions = [payments];
    await core.findAskedQuestions(interview.id);
    fake.askedQuestions = [{ ...payments, answerEvidence: [{ segmentNumber: 4, quote: "never said" }] }];
    const result = await core.findAskedQuestions(interview.id);

    expect(result.dropped).toBe(1);
    expect(result.askedQuestions.map((q) => q.question)).toEqual([payments.question]);
  });

  it("is null for an Interview whose questions were never looked for, and refuses an unknown Interview", () => {
    expect(core.listAskedQuestions(interview.id)).toBeNull();
    expect(() => core.listAskedQuestions("no-such-interview")).toThrow(NotFoundError);
  });

  it("refuses without a confirmed Speaker Mapping or an API key, without calling the model", async () => {
    await expect(core.findAskedQuestions(interview.id)).rejects.toMatchObject({ reason: "noTranscript" });
    importTranscript();
    await expect(core.findAskedQuestions(interview.id)).rejects.toMatchObject({ reason: "speakerMappingNotConfirmed" });
    confirmRoles(core.getTranscript(interview.id)!);
    await expect(core.findAskedQuestions(interview.id)).rejects.toMatchObject({ reason: "apiKeyMissing" });
    expect(fake.askedQuestionRequests).toEqual([]);
  });

  it("changes nothing when the model call fails", async () => {
    ready();
    fake.askedQuestions = [payments];
    await core.findAskedQuestions(interview.id);
    const before = core.listAskedQuestions(interview.id);
    fake.askedQuestions = new Error("network down");

    await expect(core.findAskedQuestions(interview.id)).rejects.toThrow(AiProviderError);
    expect(core.listAskedQuestions(interview.id)).toEqual(before);
  });

  it("marks the Asked Questions Stale when the Speaker Mapping changes, and removes them when the Transcript is replaced", async () => {
    ready();
    fake.askedQuestions = [payments];
    await core.findAskedQuestions(interview.id);
    clock = new Date("2026-11-10T10:00:00Z");

    confirmRoles(core.getTranscript(interview.id)!, "Ayşe");
    expect(core.listAskedQuestions(interview.id)).toMatchObject({ stale: true, askedQuestions: [{ stale: true }] });

    importTranscript();
    expect(core.listAskedQuestions(interview.id)).toBeNull();
  });
});

describe("Saved Questions in the Asked Questions", () => {
  it("says, for each Interview whose questions were found, where each Saved Question was asked or that it was not found", async () => {
    ready();
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-10" });
    const asked = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    const notAsked = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    fake.askedQuestions = [backgroundJobs, { ...payments, savedQuestionId: asked.id }];
    const { askedQuestions } = await core.findAskedQuestions(interview.id);
    // Written after the questions were looked for, so it was not checked in that Interview.
    const later = core.addSavedQuestion({ candidateId: candidate.id, text: "Kuyrukları nasıl izlediniz?" });

    const checks = core.listSavedQuestionChecks(candidate.id);

    expect(checks).toEqual([
      { savedQuestionId: asked.id, interviewId: interview.id, askedQuestion: askedQuestions[1], stale: false },
      { savedQuestionId: notAsked.id, interviewId: interview.id, askedQuestion: null, stale: false },
    ]);
    expect(checks.some((c) => c.savedQuestionId === later.id || c.interviewId === second.id)).toBe(false);
  });

  it("refuses an unknown Candidate", () => {
    expect(() => core.listSavedQuestionChecks("no-such-candidate")).toThrow(NotFoundError);
  });
});

describe("Asked Questions from the AI client", () => {
  it("saves them with the same quote check, marked as from the AI client, only while saving is allowed", () => {
    confirmRoles(importTranscript());
    const saved = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    const proposed = [backgroundJobs, { ...payments, answerEvidence: [{ segmentNumber: 4, quote: "never said" }] }];

    expect(() => core.saveAskedQuestionsFromClient(interview.id, proposed)).toThrow(
      expect.objectContaining({ reason: "aiClientWritesOff" }),
    );
    expect(core.listAskedQuestions(interview.id)).toBeNull();

    core.allowAiClientWrites(true);
    const result = core.saveAskedQuestionsFromClient(interview.id, proposed);

    expect(result.dropped).toBe(1);
    expect(result.askedQuestions).toMatchObject([{ question: backgroundJobs.question, source: "aiClient" }]);
    expect(core.listSavedQuestionChecks(candidate.id)).toEqual([
      { savedQuestionId: saved.id, interviewId: interview.id, askedQuestion: null, stale: false },
    ]);
  });
});

