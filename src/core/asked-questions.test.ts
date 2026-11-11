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

  it("shows the exchange to the end of the Candidate's answer, up to the Interviewer's next segment", async () => {
    core.saveApiKey("sk-ant-test-key");
    confirmRoles(
      importTranscript([
        "Ayşe: Arka plan işlerini nasıl çalıştırdınız?",
        "Ece: Redis ile BullMQ kullandık.",
        "Ece: İşler üç kez yeniden denenirdi.",
        "Ece: Hatalar Sentry'ye giderdi.",
        "Ayşe: Ödeme servisini kim yazdı?",
      ]),
    );
    fake.askedQuestions = [backgroundJobs];

    const [asked] = (await core.findAskedQuestions(interview.id)).askedQuestions;

    expect(asked).toMatchObject({ firstSegment: 1, lastSegment: 4 });
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

  it("records that no question was found, and never wipes earlier questions with an answer that has none usable", async () => {
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

    fake.askedQuestions = [];
    expect((await core.findAskedQuestions(interview.id)).askedQuestions.map((q) => q.question)).toEqual([payments.question]);
  });

  it("saves nothing when the Transcript changes while the model is answering", async () => {
    ready();
    const slowCore = openCore(join(dir, "test.sqlite"), {
      now: () => clock,
      aiProvider: () => ({
        proposeAiNotes: async () => [],
        proposeQuestions: async () => [],
        proposeAskedQuestions: async () => {
          // The Interviewer imports the Transcript again a minute later.
          clock = new Date("2026-11-10T09:31:00Z");
          confirmRoles(importTranscript());
          return [payments];
        },
      }),
    });

    await expect(slowCore.findAskedQuestions(interview.id)).rejects.toMatchObject({ reason: "transcriptChanged" });
    expect(core.listAskedQuestions(interview.id)).toBeNull();
    slowCore.close();
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
    expect(() => core.listSavedQuestionStates("no-such-candidate")).toThrow(NotFoundError);
  });

  it("gives every Saved Question one state: asked, not found, or planned", async () => {
    ready();
    const asked = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    const notAsked = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    expect(core.listSavedQuestionStates(candidate.id).map((s) => s.state)).toEqual(["planned", "planned"]);
    fake.askedQuestions = [backgroundJobs, { ...payments, savedQuestionId: asked.id }];
    await core.findAskedQuestions(interview.id);
    // Written after the questions were looked for, so no Transcript was checked for it.
    const later = core.addSavedQuestion({ candidateId: candidate.id, text: "Kuyrukları nasıl izlediniz?" });

    expect(core.listSavedQuestionStates(candidate.id)).toEqual([
      { savedQuestionId: asked.id, state: "asked", decidedBy: "transcripts", transcriptState: "asked", differsFromTranscripts: false },
      { savedQuestionId: notAsked.id, state: "notFound", decidedBy: "transcripts", transcriptState: "notFound", differsFromTranscripts: false },
      { savedQuestionId: later.id, state: "planned", decidedBy: "transcripts", transcriptState: "planned", differsFromTranscripts: false },
    ]);
  });

  it("counts a Saved Question as asked when any Interview has it, and as planned again when that Interview is deleted", async () => {
    ready();
    const question = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    fake.askedQuestions = [{ ...payments, savedQuestionId: question.id }];
    await core.findAskedQuestions(interview.id);
    // A second Interview in which the question is looked for and not found.
    const first = interview;
    interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });
    confirmRoles(importTranscript());
    fake.askedQuestions = [backgroundJobs];
    await core.findAskedQuestions(interview.id);
    expect(core.listSavedQuestionStates(candidate.id).map((s) => s.state)).toEqual(["asked"]);

    core.deleteInterview(first.id);
    expect(core.listSavedQuestionStates(candidate.id).map((s) => s.state)).toEqual(["notFound"]);

    core.deleteInterview(interview.id);
    expect(core.listSavedQuestionStates(candidate.id).map((s) => s.state)).toEqual(["planned"]);
  });
});

describe("The Interviewer's mark and the state of a Saved Question", () => {
  it("follows the Interviewer's mark, and says who decided the state", () => {
    const marked = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    const unmarked = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });

    core.markSavedQuestion(marked.id, "asked");

    expect(core.listSavedQuestionStates(candidate.id)).toEqual([
      { savedQuestionId: marked.id, state: "asked", decidedBy: "interviewer", transcriptState: "planned", differsFromTranscripts: false },
      { savedQuestionId: unmarked.id, state: "planned", decidedBy: "transcripts", transcriptState: "planned", differsFromTranscripts: false },
    ]);
  });

  it("lets the Interviewer's mark win over the Transcripts, says when the two differ, and follows the Transcripts again without the mark", async () => {
    ready();
    const found = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    const notFound = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    fake.askedQuestions = [{ ...payments, savedQuestionId: found.id }];
    await core.findAskedQuestions(interview.id);

    core.markSavedQuestion(found.id, "notAsked");
    core.markSavedQuestion(notFound.id, "asked");
    expect(core.listSavedQuestionStates(candidate.id)).toEqual([
      { savedQuestionId: found.id, state: "planned", decidedBy: "interviewer", transcriptState: "asked", differsFromTranscripts: true },
      { savedQuestionId: notFound.id, state: "asked", decidedBy: "interviewer", transcriptState: "notFound", differsFromTranscripts: true },
    ]);

    // A mark that agrees with the Transcripts is still the Interviewer's, with nothing to point out.
    core.markSavedQuestion(found.id, "asked");
    core.markSavedQuestion(notFound.id, "notAsked");
    expect(core.listSavedQuestionStates(candidate.id)).toEqual([
      { savedQuestionId: found.id, state: "asked", decidedBy: "interviewer", transcriptState: "asked", differsFromTranscripts: false },
      { savedQuestionId: notFound.id, state: "planned", decidedBy: "interviewer", transcriptState: "notFound", differsFromTranscripts: false },
    ]);

    core.markSavedQuestion(found.id, null);
    core.markSavedQuestion(notFound.id, null);
    expect(core.listSavedQuestionStates(candidate.id).map((s) => [s.state, s.decidedBy])).toEqual([
      ["asked", "transcripts"],
      ["notFound", "transcripts"],
    ]);
  });

  it("keeps the mark when Asked Questions are found again, a Transcript is replaced, or an Interview is deleted", async () => {
    ready();
    const markedAsked = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    const markedNotAsked = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    core.markSavedQuestion(markedAsked.id, "asked");
    core.markSavedQuestion(markedNotAsked.id, "notAsked");
    const marks = () => core.listSavedQuestions(candidate.id).map((q) => q.mark);
    const states = () => core.listSavedQuestionStates(candidate.id).map((s) => [s.state, s.decidedBy]);
    const asMarked = [
      ["asked", "interviewer"],
      ["planned", "interviewer"],
    ];

    // The model matches the question marked as not asked, and not the one marked as asked.
    fake.askedQuestions = [{ ...payments, savedQuestionId: markedNotAsked.id }];
    await core.findAskedQuestions(interview.id);
    await core.findAskedQuestions(interview.id);
    expect(marks()).toEqual(["asked", "notAsked"]);
    expect(states()).toEqual(asMarked);

    confirmRoles(importTranscript());
    expect(marks()).toEqual(["asked", "notAsked"]);
    expect(states()).toEqual(asMarked);

    core.deleteInterview(interview.id);
    expect(marks()).toEqual(["asked", "notAsked"]);
    expect(states()).toEqual(asMarked);
  });

  it("keeps the mark when the AI client saves Asked Questions", () => {
    confirmRoles(importTranscript());
    const question = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    core.markSavedQuestion(question.id, "notAsked");
    core.allowAiClientWrites(true);

    core.saveAskedQuestionsFromClient(interview.id, [{ ...payments, savedQuestionId: question.id }]);

    expect(core.listSavedQuestions(candidate.id).map((q) => q.mark)).toEqual(["notAsked"]);
    expect(core.listSavedQuestionStates(candidate.id)).toEqual([
      { savedQuestionId: question.id, state: "planned", decidedBy: "interviewer", transcriptState: "asked", differsFromTranscripts: true },
    ]);
  });
});

describe("Saying by hand whether a Saved Question was asked", () => {
  const stateOf = (id: string) => core.listSavedQuestionStates(candidate.id).find((s) => s.savedQuestionId === id)!;

  it("keeps a mark only while it says something the Transcripts do not", async () => {
    ready();
    const found = core.addSavedQuestion({ candidateId: candidate.id, text: "Ödeme servisini kim yazdı?" });
    const notFound = core.addSavedQuestion({ candidateId: candidate.id, text: "Testleri nasıl yazdınız?" });
    fake.askedQuestions = [{ ...payments, savedQuestionId: found.id }];
    await core.findAskedQuestions(interview.id);

    // Against the Transcripts: the Interviewer's word is kept as a mark.
    expect(core.setSavedQuestionAsked(found.id, false).mark).toBe("notAsked");
    expect(stateOf(found.id)).toMatchObject({ state: "planned", decidedBy: "interviewer", differsFromTranscripts: true });
    expect(core.setSavedQuestionAsked(notFound.id, true).mark).toBe("asked");
    expect(stateOf(notFound.id)).toMatchObject({ state: "asked", decidedBy: "interviewer", differsFromTranscripts: true });

    // Back to what the Transcripts say: no mark is needed, and none is left.
    expect(core.setSavedQuestionAsked(found.id, true).mark).toBeNull();
    expect(stateOf(found.id)).toMatchObject({ state: "asked", decidedBy: "transcripts" });
    expect(core.setSavedQuestionAsked(notFound.id, false).mark).toBeNull();
    expect(stateOf(notFound.id)).toMatchObject({ state: "notFound", decidedBy: "transcripts" });
  });

  it("marks a question no Transcript was checked for as asked, and takes the mark off again", () => {
    const question = core.addSavedQuestion({ candidateId: candidate.id, text: "Kuyrukları nasıl izlediniz?" });

    expect(core.setSavedQuestionAsked(question.id, true).mark).toBe("asked");
    expect(stateOf(question.id)).toMatchObject({ state: "asked", decidedBy: "interviewer", differsFromTranscripts: false });
    expect(core.setSavedQuestionAsked(question.id, false).mark).toBeNull();
    expect(stateOf(question.id)).toMatchObject({ state: "planned", decidedBy: "transcripts" });
    expect(() => core.setSavedQuestionAsked("no-such-question", true)).toThrow(NotFoundError);
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

