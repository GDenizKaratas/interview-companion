import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeAiProvider, type FakeAiProvider } from "./testing/fake-ai-provider.ts";
import { makePdf } from "./testing/make-pdf.ts";
import { AiProviderError, NotFoundError, PreconditionError, openCore, type Candidate, type Core, type Interview, type Transcript } from "./index.ts";

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
  core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10", now: () => clock, aiProvider: fake.factory });
  candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

const cv = makePdf([
  [
    { text: "Ece Yalın", size: 24 },
    { text: "Built payment services with Node.js and BullMQ.", size: 10 },
  ],
]);

// Segment 1 is the Interviewer, segment 2 the Candidate.
const transcriptLines = [
  "Ayşe: Arka plan işlerini nasıl çalıştırdınız?",
  "Ece: Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi.",
];

function importTranscript(interviewId = interview.id, lines = transcriptLines): Transcript {
  return core.importTranscript(interviewId, {
    fileName: "t.txt",
    bytes: new TextEncoder().encode(lines.join("\n")),
  });
}

function confirmRoles(transcript: Transcript): void {
  const roles = Object.fromEntries(
    transcript.speakers.map((speaker) => [speaker.id, speaker.label === "Ece" ? "candidate" : "interviewer"] as const),
  );
  core.confirmSpeakerMapping(transcript.interviewId, roles);
}

// A Candidate with a key, a CV, a Transcript with a confirmed Speaker Mapping, a note, and a Saved Question.
async function ready(): Promise<void> {
  core.saveApiKey("sk-ant-test-key");
  await core.attachCv(candidate.id, { fileName: "cv.pdf", bytes: cv });
  confirmRoles(importTranscript());
  core.addInterviewerNotes({ candidateId: candidate.id, interviewId: interview.id, text: "Ask about retries." });
  core.addSavedQuestion({ candidateId: candidate.id, text: "How did you test the payment service?" });
}

describe("Suggested Question generation", () => {
  it("sends the CV, Transcripts, Interviewer Notes, Saved Questions, and the focus, and saves what the model proposes", async () => {
    await ready();
    fake.questions = [
      {
        question: "BullMQ işi üç kez başarısız olursa ne olur?",
        reason: "CV BullMQ'dan söz ediyor; tekrar denemeler konuşuldu ama sonrası değil.",
        evidence: [
          { source: "cv", page: 1, quote: "Node.js and BullMQ" },
          { source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "üç kez yeniden denenirdi" },
        ],
      },
    ];

    const result = await core.generateSuggestedQuestions(candidate.id, { focus: "  güvenilirlik  " });

    expect(fake.questionRequests).toEqual([
      {
        language: "en",
        focus: "güvenilirlik",
        cvPages: [{ number: 1, text: expect.stringContaining("Built payment services with Node.js and BullMQ.") }],
        transcripts: [
          {
            interviewId: interview.id,
            interviewNumber: 1,
            segments: [
              { number: 1, role: "interviewer", text: "Arka plan işlerini nasıl çalıştırdınız?" },
              { number: 2, role: "candidate", text: "Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi." },
            ],
          },
        ],
        interviewerNotes: ["Ask about retries."],
        savedQuestions: ["How did you test the payment service?"],
      },
    ]);
    const expected = [
      {
        candidateId: candidate.id,
        text: "BullMQ işi üç kez başarısız olursa ne olur?",
        reason: "CV BullMQ'dan söz ediyor; tekrar denemeler konuşuldu ama sonrası değil.",
        general: false,
        accepted: false,
        dismissed: false,
        generatedAt: "2026-11-10T09:30:00.000Z",
        evidence: [
          { source: "cv", page: 1, quote: "Node.js and BullMQ" },
          { source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "üç kez yeniden denenirdi" },
        ],
      },
    ];
    expect(result).toMatchObject({ suggestions: expected, dropped: 0, leftOut: [] });
    expect(core.listSuggestedQuestions(candidate.id)).toMatchObject(expected);
  });

  it("keeps a suggestion with no Evidence as a general question", async () => {
    await ready();
    fake.questions = [{ question: "Tell me about a hard bug.", reason: "A general question.", evidence: [] }];

    const { suggestions } = await core.generateSuggestedQuestions(candidate.id);

    expect(suggestions).toMatchObject([{ text: "Tell me about a hard bug.", general: true, evidence: [] }]);
  });

  it("drops a suggestion whose quote is not word for word in its source, and keeps the others", async () => {
    await ready();
    fake.questions = [
      {
        question: "Invented CV quote",
        reason: "r",
        evidence: [{ source: "cv", page: 1, quote: "Node.js and Kafka" }],
      },
      {
        question: "Wrong segment",
        reason: "r",
        evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 1, quote: "Redis ile BullMQ" }],
      },
      { question: "Missing page", reason: "r", evidence: [{ source: "cv", page: 2, quote: "Ece" }] },
      { question: "No reason", reason: " ", evidence: [] },
      { question: "Kept", reason: "r", evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Redis ile BullMQ" }] },
    ];

    const result = await core.generateSuggestedQuestions(candidate.id);

    expect(result.suggestions.map((s) => s.text)).toEqual(["Kept"]);
    expect(result.dropped).toBe(4);
  });

  it("leaves out a Transcript whose Speaker Mapping is not confirmed, and drops a quote from it", async () => {
    await ready();
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });
    importTranscript(second.id);
    fake.questions = [
      {
        question: "From the unconfirmed Transcript",
        reason: "r",
        evidence: [{ source: "transcript", interviewId: second.id, segmentNumber: 2, quote: "Redis" }],
      },
    ];

    const result = await core.generateSuggestedQuestions(candidate.id);

    expect(fake.questionRequests[0]?.transcripts.map((t) => t.interviewId)).toEqual([interview.id]);
    expect(result).toMatchObject({ suggestions: [], dropped: 1, leftOut: [second.id] });
  });

  it("sends empty lists and no focus for a Candidate with nothing yet", async () => {
    core.saveApiKey("sk-ant-test-key");

    await core.generateSuggestedQuestions(candidate.id, { focus: "   " });

    expect(fake.questionRequests).toEqual([
      { language: "en", focus: null, cvPages: [], transcripts: [], interviewerNotes: [], savedQuestions: [] },
    ]);
  });

  it("refuses without an API key and makes no call", async () => {
    const refusal = core.generateSuggestedQuestions(candidate.id);

    await expect(refusal).rejects.toBeInstanceOf(PreconditionError);
    await expect(refusal).rejects.toThrow(expect.objectContaining({ reason: "apiKeyMissing" }));
    expect(fake.questionRequests).toEqual([]);
  });

  it("changes nothing when the model call fails", async () => {
    await ready();
    fake.questions = [{ question: "First", reason: "r", evidence: [] }];
    await core.generateSuggestedQuestions(candidate.id);
    fake.questions = new AiProviderError("rateLimited", "Too many requests.");

    await expect(core.generateSuggestedQuestions(candidate.id)).rejects.toThrow(
      expect.objectContaining({ failure: "rateLimited" }),
    );
    expect(core.listSuggestedQuestions(candidate.id).map((s) => s.text)).toEqual(["First"]);
  });
});

describe("No model call without a request", () => {
  it("makes no call when the Workspace data is read, a CV or Transcript is added, or the database is opened again", async () => {
    await ready();

    core.listSuggestedQuestions(candidate.id);
    core.listSavedQuestions(candidate.id);
    core.getCandidateOverview(candidate.id);
    core.close();
    core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10", now: () => clock, aiProvider: fake.factory });
    core.listSuggestedQuestions(candidate.id);

    expect(fake.questionRequests).toEqual([]);
    expect(fake.apiKeys).toEqual([]);
  });
});

// Generates two suggestions: one quoting the CV, one quoting the Transcript.
async function twoSuggestions() {
  await ready();
  fake.questions = [
    { question: "About BullMQ?", reason: "CV.", evidence: [{ source: "cv", page: 1, quote: "BullMQ" }] },
    {
      question: "About retries?",
      reason: "Transcript.",
      evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "üç kez" }],
    },
  ];
  const { suggestions } = await core.generateSuggestedQuestions(candidate.id);
  return suggestions as [(typeof suggestions)[0], (typeof suggestions)[0]];
}

describe("Accepting, editing, and dismissing a Suggested Question", () => {
  it("accepting copies the question to the end of Saved Questions as from a suggestion", async () => {
    const [first] = await twoSuggestions();

    const saved = core.acceptSuggestedQuestion(first.id);

    expect(saved).toMatchObject({ candidateId: candidate.id, text: "About BullMQ?", origin: "suggestion" });
    expect(core.listSavedQuestions(candidate.id).map((q) => [q.text, q.origin])).toEqual([
      ["How did you test the payment service?", "written"],
      ["About BullMQ?", "suggestion"],
    ]);
    expect(core.listSuggestedQuestions(candidate.id).find((s) => s.id === first.id)?.accepted).toBe(true);
  });

  it("accepting the same suggestion twice is refused, so the question is not saved twice", async () => {
    const [first] = await twoSuggestions();
    core.acceptSuggestedQuestion(first.id);

    expect(() => core.acceptSuggestedQuestion(first.id)).toThrow(
      expect.objectContaining({ reason: "suggestionAccepted" }),
    );
    expect(core.listSavedQuestions(candidate.id)).toHaveLength(2);
  });

  it("an edited suggestion is accepted with the edited text", async () => {
    const [first] = await twoSuggestions();

    const edited = core.editSuggestedQuestion(first.id, "  How did BullMQ retry jobs?  ");
    core.acceptSuggestedQuestion(first.id);

    expect(edited).toMatchObject({ text: "How did BullMQ retry jobs?", reason: "CV.", accepted: false });
    expect(core.listSavedQuestions(candidate.id).at(-1)?.text).toBe("How did BullMQ retry jobs?");
  });

  it("refuses an empty edit and an edit of an accepted suggestion", async () => {
    const [first] = await twoSuggestions();

    expect(() => core.editSuggestedQuestion(first.id, "  ")).toThrow(
      expect.objectContaining({ field: "text", rule: "required" }),
    );
    core.acceptSuggestedQuestion(first.id);
    expect(() => core.editSuggestedQuestion(first.id, "Other")).toThrow(
      expect.objectContaining({ reason: "suggestionAccepted" }),
    );
  });

  it("dismissing hides a suggestion without deleting it, and it can be shown again", async () => {
    const [first] = await twoSuggestions();

    expect(core.dismissSuggestedQuestion(first.id).dismissed).toBe(true);
    expect(() => core.acceptSuggestedQuestion(first.id)).toThrow(
      expect.objectContaining({ reason: "suggestionDismissed" }),
    );
    expect(() => core.editSuggestedQuestion(first.id, "Other")).toThrow(
      expect.objectContaining({ reason: "suggestionDismissed" }),
    );
    expect(core.restoreSuggestedQuestion(first.id).dismissed).toBe(false);
    expect(core.listSavedQuestions(candidate.id)).toHaveLength(1);
  });

  it("refuses an unknown suggestion", () => {
    expect(() => core.acceptSuggestedQuestion("nope")).toThrow(NotFoundError);
    expect(() => core.dismissSuggestedQuestion("nope")).toThrow(NotFoundError);
  });
});

describe("Regenerating Suggested Questions", () => {
  it("replaces only suggestions that were not accepted and leaves Saved Questions unchanged", async () => {
    const [first, second] = await twoSuggestions();
    core.acceptSuggestedQuestion(first.id);
    core.editSuggestedQuestion(second.id, "Edited but not accepted");
    core.addSavedQuestion({ candidateId: candidate.id, text: "Written after accepting." });
    const savedBefore = core.listSavedQuestions(candidate.id);
    clock = new Date("2026-11-10T10:00:00Z");
    fake.questions = [{ question: "New one", reason: "r", evidence: [] }];

    const { suggestions } = await core.generateSuggestedQuestions(candidate.id);

    expect(suggestions.map((s) => [s.text, s.accepted])).toEqual([
      ["New one", false],
      ["About BullMQ?", true],
    ]);
    expect(core.listSavedQuestions(candidate.id)).toEqual(savedBefore);
    expect(fake.questionRequests.at(-1)?.savedQuestions).toEqual([
      "How did you test the payment service?",
      "About BullMQ?",
      "Written after accepting.",
    ]);
  });

  it("also replaces dismissed suggestions", async () => {
    const [first] = await twoSuggestions();
    core.dismissSuggestedQuestion(first.id);
    fake.questions = [{ question: "New one", reason: "r", evidence: [] }];

    const { suggestions } = await core.generateSuggestedQuestions(candidate.id);

    expect(suggestions.map((s) => s.text)).toEqual(["New one"]);
  });

  it("keeps the earlier suggestions when no proposed suggestion passes the check", async () => {
    await twoSuggestions();
    fake.questions = [{ question: "Bad", reason: "r", evidence: [{ source: "cv", page: 1, quote: "Kafka" }] }];

    const result = await core.generateSuggestedQuestions(candidate.id);

    expect(result.suggestions.map((s) => s.text)).toEqual(["About BullMQ?", "About retries?"]);
    expect(result.dropped).toBe(1);
  });
});

describe("Replacing a source", () => {
  it("removes the suggestions that quote a replaced Transcript, and keeps their Saved Question copies", async () => {
    const [first, second] = await twoSuggestions();
    core.acceptSuggestedQuestion(second.id);

    importTranscript(interview.id, ["Ece: Yeni bir dosya."]);

    expect(core.listSuggestedQuestions(candidate.id).map((s) => s.id)).toEqual([first.id]);
    expect(core.listSavedQuestions(candidate.id).map((q) => q.text)).toContain("About retries?");
  });

  it("removes the suggestions that quote a replaced CV", async () => {
    const [, second] = await twoSuggestions();

    await core.attachCv(candidate.id, { fileName: "new.pdf", bytes: cv });

    expect(core.listSuggestedQuestions(candidate.id).map((s) => s.id)).toEqual([second.id]);
  });
});
