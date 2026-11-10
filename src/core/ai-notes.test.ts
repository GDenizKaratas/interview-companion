import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeAiProvider, type FakeAiProvider } from "./testing/fake-ai-provider.ts";
import { AiProviderError, NotFoundError, openCore, type Core, type Interview, type Transcript } from "./index.ts";

let dir: string;
let core: Core;
let fake: FakeAiProvider;
let interview: Interview;
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  clock = new Date("2026-11-10T09:30:00Z");
  fake = fakeAiProvider();
  core = openCore(join(dir, "test.sqlite"), { now: () => clock, aiProvider: fake.factory });
  const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Segment 1 is the Interviewer, segments 2 and 3 the Candidate.
const transcriptLines = [
  "Ayşe: Arka plan işlerini nasıl çalıştırdınız?",
  "Ece: Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi.",
  "Ece: Ödeme servisini ben yazdım.",
];

function importTranscript(lines = transcriptLines): Transcript {
  return core.importTranscript(interview.id, {
    fileName: "t.txt",
    bytes: new TextEncoder().encode(lines.join("\n")),
  });
}

function confirmRoles(transcript: Transcript): void {
  const roles = Object.fromEntries(
    transcript.speakers.map((speaker) => [speaker.id, speaker.label === "Ece" ? "candidate" : "interviewer"] as const),
  );
  core.confirmSpeakerMapping(interview.id, roles);
}

// An Interview ready for generation: a key, a Transcript, and a confirmed Speaker Mapping.
function ready(): void {
  core.saveApiKey("sk-ant-test-key");
  confirmRoles(importTranscript());
}

describe("AI Note generation", () => {
  it("saves a note whose quote appears word for word in a Candidate segment, as Unreviewed", async () => {
    ready();
    fake.answer = [
      {
        statement: "Arka plan işleri için Redis ve BullMQ kullandığını anlattı.",
        evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }],
      },
    ];

    const result = await core.generateAiNotes(interview.id);

    const expected = [
      {
        interviewId: interview.id,
        statement: "Arka plan işleri için Redis ve BullMQ kullandığını anlattı.",
        reviewState: "unreviewed",
        generatedAt: "2026-11-10T09:30:00.000Z",
        evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }],
      },
    ];
    expect(result.notes).toMatchObject(expected);
    expect(result.dropped).toBe(0);
    expect(core.listAiNotes(interview.id)).toMatchObject(expected);
    expect(fake.apiKeys).toEqual(["sk-ant-test-key"]);
  });

  it("drops a note whose quote is not in the Transcript word for word, and keeps the others", async () => {
    ready();
    fake.answer = [
      { statement: "Kafka kullandığını söyledi.", evidence: [{ segmentNumber: 2, quote: "Kafka kullandık" }] },
      { statement: "Ödeme servisini yazdı.", evidence: [{ segmentNumber: 3, quote: "Ödeme servisini ben yazdım." }] },
    ];

    const result = await core.generateAiNotes(interview.id);

    expect(result.dropped).toBe(1);
    expect(core.listAiNotes(interview.id).map((note) => note.statement)).toEqual(["Ödeme servisini yazdı."]);
  });

  it("drops a note when any one of its quotes fails, and notes that cannot be checked at all", async () => {
    ready();
    fake.answer = [
      // One good quote and one invented: the note is not backed, so it goes.
      {
        statement: "İki şey söyledi.",
        evidence: [
          { segmentNumber: 2, quote: "Redis ile BullMQ kullandık" },
          { segmentNumber: 3, quote: "Faturalamayı da ben yazdım" },
        ],
      },
      // A quote changed in one letter is not word for word.
      { statement: "BullMQ kullandı.", evidence: [{ segmentNumber: 2, quote: "redis ile BullMQ kullandık" }] },
      // The right words, but cited from a segment that does not contain them.
      { statement: "Ödeme servisi.", evidence: [{ segmentNumber: 2, quote: "Ödeme servisini ben yazdım." }] },
      // A segment that does not exist.
      { statement: "Bir şey.", evidence: [{ segmentNumber: 9, quote: "Redis" }] },
      // An empty quote is found in every text, so it proves nothing.
      { statement: "Boş alıntı.", evidence: [{ segmentNumber: 2, quote: "  " }] },
      // No Evidence at all.
      { statement: "Kanıtsız.", evidence: [] },
      // No statement.
      { statement: " ", evidence: [{ segmentNumber: 2, quote: "Redis" }] },
    ];

    const result = await core.generateAiNotes(interview.id);

    expect(result).toEqual({ notes: [], dropped: 7 });
  });

  it("drops a note quoting the Interviewer, so their words are never credited to the Candidate", async () => {
    ready();
    fake.answer = [
      { statement: "Arka plan işlerinden bahsetti.", evidence: [{ segmentNumber: 1, quote: "Arka plan işlerini" }] },
    ];

    const result = await core.generateAiNotes(interview.id);

    expect(result).toEqual({ notes: [], dropped: 1 });
  });

  it("sends each segment with its confirmed role and the interface language, but not the speaker labels", async () => {
    ready();
    core.setInterfaceLanguage("tr");

    await core.generateAiNotes(interview.id);

    expect(fake.requests).toEqual([
      {
        language: "tr",
        segments: [
          { number: 1, role: "interviewer", text: "Arka plan işlerini nasıl çalıştırdınız?" },
          { number: 2, role: "candidate", text: "Redis ile BullMQ kullandık, işler üç kez yeniden denenirdi." },
          { number: 3, role: "candidate", text: "Ödeme servisini ben yazdım." },
        ],
      },
    ]);
  });

  it("replaces the Interview's earlier AI Notes when generated again", async () => {
    ready();
    fake.answer = [{ statement: "İlk.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);
    fake.answer = [{ statement: "İkinci.", evidence: [{ segmentNumber: 3, quote: "Ödeme" }] }];

    await core.generateAiNotes(interview.id);

    expect(core.listAiNotes(interview.id).map((note) => note.statement)).toEqual(["İkinci."]);
  });

  it("refuses before the Speaker Mapping is confirmed, without calling the model", async () => {
    core.saveApiKey("sk-ant-test-key");
    importTranscript();

    await expect(core.generateAiNotes(interview.id)).rejects.toMatchObject({
      name: "PreconditionError",
      reason: "speakerMappingNotConfirmed",
    });
    expect(fake.requests).toEqual([]);
  });

  it("refuses an Interview without a Transcript, without calling the model", async () => {
    core.saveApiKey("sk-ant-test-key");

    await expect(core.generateAiNotes(interview.id)).rejects.toMatchObject({ reason: "noTranscript" });
    expect(fake.requests).toEqual([]);
  });

  it("refuses without an API key, without calling the model", async () => {
    confirmRoles(importTranscript());

    await expect(core.generateAiNotes(interview.id)).rejects.toMatchObject({ reason: "apiKeyMissing" });
    expect(fake.requests).toEqual([]);
  });

  it("refuses an unknown Interview", async () => {
    core.saveApiKey("sk-ant-test-key");

    await expect(core.generateAiNotes("no-such-interview")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never calls the model unless generation is asked for", async () => {
    ready();
    core.setInterfaceLanguage("tr");
    core.listAiNotes(interview.id);
    core.getTranscript(interview.id);
    core.hasApiKey();

    expect(fake.requests).toEqual([]);
  });

  it("changes nothing when the model call fails", async () => {
    ready();
    fake.answer = [{ statement: "Önceki not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);
    const before = core.listAiNotes(interview.id);
    fake.answer = new Error("network down");

    await expect(core.generateAiNotes(interview.id)).rejects.toBeInstanceOf(AiProviderError);
    expect(core.listAiNotes(interview.id)).toEqual(before);
  });

  it("saves nothing when the Transcript changes while the model is answering", async () => {
    ready();
    fake.answer = [{ statement: "Not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    const generation = core.generateAiNotes(interview.id);
    // Confirming again while the model works: the notes would rest on a mapping they were not made from.
    clock = new Date("2026-11-10T09:31:00Z");
    confirmRoles(core.getTranscript(interview.id)!);

    await expect(generation).rejects.toMatchObject({ reason: "transcriptChanged" });
    expect(core.listAiNotes(interview.id)).toEqual([]);
  });

  it("removes the AI Notes when the Transcript is replaced, since their quotes point into it", async () => {
    ready();
    fake.answer = [{ statement: "Not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);

    importTranscript(["Ayşe: Yeni dosya.", "Ece: Yeni cevap."]);

    expect(core.listAiNotes(interview.id)).toEqual([]);
  });
  it("keeps the earlier AI Notes when no proposed note passes the check", async () => {
    ready();
    fake.answer = [{ statement: "Önceki not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);
    const before = core.listAiNotes(interview.id);
    fake.answer = [{ statement: "Uydurma.", evidence: [{ segmentNumber: 2, quote: "Kafka" }] }];

    const result = await core.generateAiNotes(interview.id);

    expect(result).toEqual({ notes: before, dropped: 1 });
    expect(core.listAiNotes(interview.id)).toEqual(before);
  });

  it("marks AI Notes Stale when the Speaker Mapping is confirmed again after they were generated", async () => {
    ready();
    fake.answer = [{ statement: "Not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);
    expect(core.listAiNotes(interview.id).map((note) => note.stale)).toEqual([false]);

    clock = new Date("2026-11-10T10:00:00Z");
    confirmRoles(core.getTranscript(interview.id)!);

    expect(core.listAiNotes(interview.id).map((note) => note.stale)).toEqual([true]);
  });
});

describe("API key", () => {
  it("is saved without spaces around it, reported only as saved or not, and can be removed", () => {
    expect(core.hasApiKey()).toBe(false);

    core.saveApiKey("  sk-ant-test-key \n");
    expect(core.hasApiKey()).toBe(true);

    core.removeApiKey();
    expect(core.hasApiKey()).toBe(false);
  });

  it("is handed to the provider exactly as saved", async () => {
    confirmRoles(importTranscript());
    core.saveApiKey("  sk-ant-test-key ");

    await core.generateAiNotes(interview.id);

    expect(fake.apiKeys).toEqual(["sk-ant-test-key"]);
  });

  it("refuses a blank key", () => {
    expect(() => core.saveApiKey("   ")).toThrow(expect.objectContaining({ field: "apiKey", rule: "required" }));
    expect(core.hasApiKey()).toBe(false);
  });
});
