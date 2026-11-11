import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aiWorkLimits,
  InvalidInputError,
  openCore,
  type Candidate,
  type Core,
  type Interview,
  type ProposedAiNote,
  type ProposedAskedQuestion,
  type ProposedQuestion,
} from "./index.ts";
import { fakeAiProvider, type FakeAiProvider } from "./testing/fake-ai-provider.ts";

// ADR 0005's promise, for every way AI work comes in: whoever wrote it (the app's own model,
// the AI client through MCP, or an exported Candidate being imported), core holds it to the same
// bounds where each artifact is saved, and the AI client's saves need the Interviewer's leave.

let dirs: string[];
let fake: FakeAiProvider;
let core: Core;
let candidate: Candidate;
let interview: Interview;

function openTempCore(): Core {
  const dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dirs.push(dir);
  return openCore(join(dir, "test.sqlite"), {
    today: () => "2026-11-10",
    now: () => new Date("2026-11-10T09:30:00Z"),
    aiProvider: fake.factory,
  });
}

// Segment 1 is the Interviewer, segment 2 the Candidate, both confirmed.
function addConfirmedTranscript(on: Core): { candidate: Candidate; interview: Interview } {
  const added = on.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  const held = on.addInterview({ candidateId: added.id, date: "2026-11-03" });
  const transcript = on.importTranscript(held.id, {
    fileName: "t.txt",
    bytes: new TextEncoder().encode("Ayşe: Arka plan işlerini nasıl çalıştırdınız?\nEce: Redis ile BullMQ kullandık."),
  });
  on.confirmSpeakerMapping(
    held.id,
    Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ece" ? "candidate" : "interviewer"] as const)),
  );
  return { candidate: added, interview: held };
}

beforeEach(() => {
  dirs = [];
  fake = fakeAiProvider();
  core = openTempCore();
  ({ candidate, interview } = addConfirmedTranscript(core));
  core.saveApiKey("test-key");
  core.allowAiClientWrites(true);
});

afterEach(() => {
  core.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const tooLong = "x".repeat(aiWorkLimits.text + 1);
const quotes = (count: number) => Array.from({ length: count }, () => ({ segmentNumber: 2, quote: "Redis" }));

type Source = "app" | "aiClient";

// One kind of AI work: how to make a valid item, a too-long one, and one with too many quotes,
// and how to save a list of them from each source, giving how many were kept and dropped.
interface Artifact<T> {
  name: string;
  limit: number;
  item: (i: number) => T;
  longText: () => T;
  manyQuotes: () => T;
  save: (source: Source, items: T[]) => Promise<{ kept: number; dropped: number }>;
}

const aiNotes: Artifact<ProposedAiNote> = {
  name: "AI Notes",
  limit: aiWorkLimits.aiNotes,
  item: (i) => ({ statement: `Redis kullandı (${i}).`, evidence: quotes(1) }),
  longText: () => ({ statement: tooLong, evidence: quotes(1) }),
  manyQuotes: () => ({ statement: "Redis kullandı.", evidence: quotes(aiWorkLimits.quotesPerItem + 1) }),
  save: async (source, items) => {
    fake.answer = items;
    const saved = source === "app" ? await core.generateAiNotes(interview.id) : core.saveAiNotesFromClient(interview.id, items);
    return { kept: saved.notes.length, dropped: saved.dropped };
  },
};

const askedQuestions: Artifact<ProposedAskedQuestion> = {
  name: "Asked Questions",
  limit: aiWorkLimits.askedQuestions,
  item: (i) => ({
    question: `Arka plan işleri (${i})`,
    questionEvidence: { segmentNumber: 1, quote: "Arka plan" },
    savedQuestionId: null,
    answerSummary: "Redis kullandığını söyledi.",
    answerEvidence: quotes(1),
  }),
  longText: () => ({
    question: "Arka plan işleri",
    questionEvidence: { segmentNumber: 1, quote: "Arka plan" },
    savedQuestionId: null,
    answerSummary: tooLong,
    answerEvidence: quotes(1),
  }),
  manyQuotes: () => ({
    question: "Arka plan işleri",
    questionEvidence: { segmentNumber: 1, quote: "Arka plan" },
    savedQuestionId: null,
    answerSummary: "Redis kullandığını söyledi.",
    answerEvidence: quotes(aiWorkLimits.quotesPerItem + 1),
  }),
  save: async (source, items) => {
    fake.askedQuestions = items;
    const saved =
      source === "app" ? await core.findAskedQuestions(interview.id) : core.saveAskedQuestionsFromClient(interview.id, items);
    return { kept: saved.askedQuestions.length, dropped: saved.dropped };
  },
};

const transcriptQuote = () => ({ source: "transcript" as const, interviewId: interview.id, segmentNumber: 2, quote: "Redis" });

const suggestedQuestions: Artifact<ProposedQuestion> = {
  name: "Suggested Questions",
  limit: aiWorkLimits.suggestedQuestions,
  item: (i) => ({ question: `Redis'i neden seçtiniz (${i})?`, reason: "Transcript'te geçiyor.", evidence: [transcriptQuote()] }),
  longText: () => ({ question: "Redis'i neden seçtiniz?", reason: tooLong, evidence: [] }),
  manyQuotes: () => ({
    question: "Redis'i neden seçtiniz?",
    reason: "Transcript'te geçiyor.",
    evidence: Array.from({ length: aiWorkLimits.quotesPerItem + 1 }, transcriptQuote),
  }),
  save: async (source, items) => {
    fake.questions = items;
    const saved =
      source === "app"
        ? await core.generateSuggestedQuestions(candidate.id)
        : core.saveSuggestedQuestionsFromClient(candidate.id, items);
    return { kept: saved.suggestions.length, dropped: saved.dropped };
  },
};

const artifacts = [aiNotes, askedQuestions, suggestedQuestions] as unknown as Artifact<unknown>[];
const cases = artifacts.flatMap((artifact) => (["app", "aiClient"] as const).map((source) => ({ artifact, source })));

describe.each(cases)("$artifact.name from source $source", ({ artifact, source }) => {
  it("keeps at most the limit of one save and counts the rest as dropped", async () => {
    const items = Array.from({ length: artifact.limit + 1 }, (_, i) => artifact.item(i));

    expect(await artifact.save(source, items)).toEqual({ kept: artifact.limit, dropped: 1 });
  });

  it("drops an item with a text over the length limit", async () => {
    expect(await artifact.save(source, [artifact.item(0), artifact.longText()])).toEqual({ kept: 1, dropped: 1 });
  });

  it("drops an item with more quotes than allowed", async () => {
    expect(await artifact.save(source, [artifact.item(0), artifact.manyQuotes()])).toEqual({ kept: 1, dropped: 1 });
  });
});

describe("Every save from the AI client", () => {
  const saves: [string, () => unknown][] = [
    ["AI Notes", () => core.saveAiNotesFromClient(interview.id, [aiNotes.item(0)])],
    ["Asked Questions", () => core.saveAskedQuestionsFromClient(interview.id, [askedQuestions.item(0)])],
    ["Suggested Questions", () => core.saveSuggestedQuestionsFromClient(candidate.id, [suggestedQuestions.item(0)])],
    ["the Candidate Brief", () => core.saveCandidateBriefFromClient(candidate.id, { text: "Özet.", evidence: [] })],
  ];

  it.each(saves)("of %s is refused while the Interviewer has not allowed saving, and saves nothing", (_, save) => {
    core.allowAiClientWrites(false);

    expect(save).toThrow(expect.objectContaining({ reason: "aiClientWritesOff" }));
    expect(core.listAiNotes(interview.id)).toEqual([]);
    expect(core.listAskedQuestions(interview.id)).toBeNull();
    expect(core.listSuggestedQuestions(candidate.id)).toEqual([]);
    expect(core.getCandidateBrief(candidate.id)).toBeNull();
  });
});

describe("A Candidate Brief", () => {
  const evidence = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ number: i + 1, ...transcriptQuote() }));

  it.each([
    ["a text over the limit", () => ({ text: "x".repeat(aiWorkLimits.briefText + 1), evidence: [] })],
    ["more Evidence than allowed", () => ({ text: "Özet.", evidence: evidence(aiWorkLimits.briefEvidence + 1) })],
    ["a quote over the length limit", () => ({ text: "Özet [1].", evidence: [{ number: 1, ...transcriptQuote(), quote: tooLong }] })],
  ])("with %s is refused and nothing is saved", (_, brief) => {
    expect(() => core.saveCandidateBriefFromClient(candidate.id, brief())).toThrow(InvalidInputError);
    expect(core.getCandidateBrief(candidate.id)).toBeNull();
  });

  it("at the limits is saved", () => {
    const saved = core.saveCandidateBriefFromClient(candidate.id, {
      text: "x".repeat(aiWorkLimits.briefText),
      evidence: evidence(aiWorkLimits.briefEvidence),
    });

    expect(saved.evidence).toHaveLength(aiWorkLimits.briefEvidence);
  });
});

describe("An imported Candidate", () => {
  type Manifest = {
    interviews: { aiNotes: unknown[]; askedQuestions: { questions: unknown[] } }[];
    suggestedQuestions: unknown[];
    candidateBrief: { text: string } | null;
  };

  // An export of the Candidate with one item of each kind, with candidate.json changed by edit.
  function editedExport(edit: (manifest: Manifest) => void): Uint8Array {
    core.saveAiNotesFromClient(interview.id, [aiNotes.item(0)]);
    core.saveAskedQuestionsFromClient(interview.id, [askedQuestions.item(0)]);
    core.saveSuggestedQuestionsFromClient(candidate.id, [suggestedQuestions.item(0)]);
    core.saveCandidateBriefFromClient(candidate.id, { text: "Özet.", evidence: [] });
    const files = unzipSync(core.exportCandidate(candidate.id).bytes);
    const manifest = JSON.parse(strFromU8(files["candidate.json"]!)) as Manifest;
    edit(manifest);
    return zipSync({ ...files, "candidate.json": strToU8(JSON.stringify(manifest)) });
  }

  const repeat = (items: unknown[], count: number, key: string) =>
    Array.from({ length: count }, (_, i) => ({ ...(items[0] as object), [key]: `${i}. kayıt` }));

  it("keeps at most the limit of AI work in one generation and reports the rest", async () => {
    const zip = editedExport((manifest) => {
      const [held] = manifest.interviews;
      held!.aiNotes = repeat(held!.aiNotes, aiWorkLimits.aiNotes + 1, "statement");
      held!.askedQuestions.questions = repeat(held!.askedQuestions.questions, aiWorkLimits.askedQuestions + 1, "question");
      manifest.suggestedQuestions = repeat(manifest.suggestedQuestions, aiWorkLimits.suggestedQuestions + 1, "text");
    });
    const target = openTempCore();

    const imported = await target.importCandidate(zip);

    const [held] = target.listInterviews(imported.candidate.id);
    expect(target.listAiNotes(held!.id)).toHaveLength(aiWorkLimits.aiNotes);
    expect(target.listAskedQuestions(held!.id)?.askedQuestions).toHaveLength(aiWorkLimits.askedQuestions);
    expect(target.listSuggestedQuestions(imported.candidate.id)).toHaveLength(aiWorkLimits.suggestedQuestions);
    expect(imported.problems.map((problem) => problem.kind).sort()).toEqual(["aiNote", "askedQuestion", "suggestedQuestion"]);
    target.close();
  });

  it("with a Candidate Brief over the limit is refused, and nothing is added", async () => {
    const zip = editedExport((manifest) => {
      manifest.candidateBrief!.text = "x".repeat(aiWorkLimits.briefText + 1);
    });
    const target = openTempCore();

    await expect(target.importCandidate(zip)).rejects.toThrow(InvalidInputError);
    expect(target.listCandidates()).toEqual([]);
    target.close();
  });
});
