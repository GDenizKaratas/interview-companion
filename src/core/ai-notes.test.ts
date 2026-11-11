import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeAiProvider, type FakeAiProvider } from "./testing/fake-ai-provider.ts";
import { AiProviderError, NotFoundError, openCore, type AiNote, type Core, type Interview, type Transcript } from "./index.ts";

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

  it("replaces the Interview's Unreviewed AI Notes when generated again", async () => {
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
    // Changing the mapping while the model works: the notes would rest on a mapping they were not made from.
    clock = new Date("2026-11-10T09:31:00Z");
    changeSpeakerMapping();

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

  it("marks AI Notes Stale when the Speaker Mapping changes after they were generated", async () => {
    ready();
    fake.answer = [{ statement: "Not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);
    expect(core.listAiNotes(interview.id).map((note) => note.stale)).toEqual([false]);

    clock = new Date("2026-11-10T10:00:00Z");
    changeSpeakerMapping();

    expect(core.listAiNotes(interview.id).map((note) => note.stale)).toEqual([true]);
  });

  it("does not mark AI Notes Stale when the same roles are confirmed again", async () => {
    ready();
    fake.answer = [{ statement: "Not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];
    await core.generateAiNotes(interview.id);

    clock = new Date("2026-11-10T10:00:00Z");
    confirmRoles(core.getTranscript(interview.id)!);

    expect(core.listAiNotes(interview.id).map((note) => note.stale)).toEqual([false]);
  });
});

// A real change of the Speaker Mapping: the two speakers' roles are swapped and then put back,
// so the mapping is confirmed anew with the Candidate still the Candidate.
function changeSpeakerMapping(): void {
  const speakers = core.getTranscript(interview.id)!.speakers;
  const rolesWhere = (candidateLabel: string) =>
    Object.fromEntries(speakers.map((speaker) => [speaker.id, speaker.label === candidateLabel ? "candidate" : "interviewer"] as const));
  core.confirmSpeakerMapping(interview.id, rolesWhere("Ayşe"));
  core.confirmSpeakerMapping(interview.id, rolesWhere("Ece"));
}

// Two checked notes, generated at 09:30.
async function generated(): Promise<AiNote[]> {
  ready();
  fake.answer = [
    { statement: "Redis ve BullMQ kullandı.", evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }] },
    { statement: "Ödeme servisini yazdı.", evidence: [{ segmentNumber: 3, quote: "Ödeme servisini ben yazdım." }] },
  ];
  return (await core.generateAiNotes(interview.id)).notes;
}

describe("AI Note review", () => {
  it("confirms a note, which keeps its text and Evidence", async () => {
    const [note] = await generated();

    const confirmed = core.confirmAiNote(note!.id);

    expect(confirmed).toMatchObject({ reviewState: "confirmed", statement: "Redis ve BullMQ kullandı.", correction: null });
    expect(core.listAiNotes(interview.id).map((n) => n.reviewState)).toEqual(["confirmed", "unreviewed"]);
  });

  it("corrects a note: the Interviewer's text is saved and the AI's text and Evidence are kept", async () => {
    const [note] = await generated();

    core.correctAiNote(note!.id, "  Redis kullandı; BullMQ'yu ekip seçmişti. ");

    expect(core.listAiNotes(interview.id)[0]).toMatchObject({
      reviewState: "corrected",
      statement: "Redis ve BullMQ kullandı.",
      correction: "Redis kullandı; BullMQ'yu ekip seçmişti.",
      evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ kullandık" }],
    });
  });

  it("refuses a blank correction and leaves the note as it was", async () => {
    const [note] = await generated();

    expect(() => core.correctAiNote(note!.id, "   ")).toThrow(
      expect.objectContaining({ field: "correction", rule: "required" }),
    );
    expect(core.listAiNotes(interview.id)[0]).toMatchObject({ reviewState: "unreviewed", correction: null });
  });

  it("dismisses a note without deleting it, and shows it again as Unreviewed", async () => {
    const [note] = await generated();

    core.dismissAiNote(note!.id);
    expect(core.listAiNotes(interview.id).map((n) => [n.statement, n.reviewState])).toEqual([
      ["Redis ve BullMQ kullandı.", "dismissed"],
      ["Ödeme servisini yazdı.", "unreviewed"],
    ]);

    expect(core.restoreAiNote(note!.id)).toMatchObject({ reviewState: "unreviewed" });
  });

  it("brings a corrected note back with its correction after it was dismissed", async () => {
    const [note] = await generated();
    core.correctAiNote(note!.id, "Redis kullandı.");
    core.dismissAiNote(note!.id);

    expect(core.restoreAiNote(note!.id)).toMatchObject({ reviewState: "corrected", correction: "Redis kullandı." });
  });

  it("changes nothing when a note that is not Dismissed is shown again", async () => {
    const [note] = await generated();
    core.confirmAiNote(note!.id);

    expect(core.restoreAiNote(note!.id)).toMatchObject({ reviewState: "confirmed" });
  });

  it("refuses to confirm a Corrected note, so the correction stays what the Interviewer trusts", async () => {
    const [note] = await generated();
    core.correctAiNote(note!.id, "Redis kullandı.");

    expect(() => core.confirmAiNote(note!.id)).toThrow(expect.objectContaining({ reason: "noteCorrected" }));
    expect(core.listAiNotes(interview.id)[0]).toMatchObject({ reviewState: "corrected", correction: "Redis kullandı." });
  });

  it("keeps every reviewed note when generating again, Stale ones still Stale, and replaces only Unreviewed ones", async () => {
    const [first, second] = await generated();
    core.correctAiNote(first!.id, "Redis kullandı.");
    core.confirmAiNote(second!.id);
    clock = new Date("2026-11-10T10:00:00Z");
    changeSpeakerMapping();
    clock = new Date("2026-11-10T10:05:00Z");
    fake.answer = [{ statement: "Yeni not.", evidence: [{ segmentNumber: 2, quote: "Redis" }] }];

    await core.generateAiNotes(interview.id);

    expect(
      core.listAiNotes(interview.id).map((n) => [n.statement, n.reviewState, n.correction, n.stale]),
    ).toEqual([
      ["Yeni not.", "unreviewed", null, false],
      ["Redis ve BullMQ kullandı.", "corrected", "Redis kullandı.", true],
      ["Ödeme servisini yazdı.", "confirmed", null, true],
    ]);
  });

  it("refuses to confirm or correct a Dismissed note until it is shown again", async () => {
    const [note] = await generated();
    core.dismissAiNote(note!.id);

    expect(() => core.confirmAiNote(note!.id)).toThrow(expect.objectContaining({ reason: "noteDismissed" }));
    expect(() => core.correctAiNote(note!.id, "Metin.")).toThrow(expect.objectContaining({ reason: "noteDismissed" }));
    expect(core.listAiNotes(interview.id)[0]).toMatchObject({ reviewState: "dismissed", correction: null });
  });

  it("refuses to review an unknown AI Note", () => {
    expect(() => core.confirmAiNote("no-such-note")).toThrow(NotFoundError);
    expect(() => core.correctAiNote("no-such-note", "Metin.")).toThrow(NotFoundError);
    expect(() => core.dismissAiNote("no-such-note")).toThrow(NotFoundError);
    expect(() => core.restoreAiNote("no-such-note")).toThrow(NotFoundError);
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
