import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, PreconditionError, type Core } from "./index.ts";

const today = () => "2026-11-10";
const now = () => new Date("2026-11-10T12:00:00.000Z");

let dirs: string[];
let source: Core;
let target: Core;
let sourceDir: string;
let targetDir: string;

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dirs.push(dir);
  return dir;
}

beforeEach(() => {
  dirs = [];
  sourceDir = tempDir();
  targetDir = tempDir();
  source = openCore(join(sourceDir, "test.sqlite"), { today, now });
  target = openCore(join(targetDir, "test.sqlite"), { today, now });
});

afterEach(() => {
  source.close();
  target.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// The demo Candidate with a full Interview: CV, a confirmed Transcript, AI Notes, and Asked Questions.
async function elif() {
  const candidates = await source.loadDemoCandidates();
  return candidates.find((candidate) => candidate.name === "Elif Kaya")!;
}

function unpack(bytes: Uint8Array): { manifest: Record<string, unknown> & { files: { path: string }[] }; files: Record<string, Uint8Array> } {
  const files = unzipSync(bytes);
  return { manifest: JSON.parse(strFromU8(files["candidate.json"]!)), files };
}

function repack(files: Record<string, Uint8Array>, manifest: unknown): Uint8Array {
  return zipSync({ ...files, "candidate.json": strToU8(JSON.stringify(manifest)) });
}

function without<T extends object>(value: T, ...keys: (keyof T)[]): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key as keyof T))) as Partial<T>;
}

// Everything core shows about a Candidate. Ids are replaced by what they point to (an Interview
// by its number, a Saved Question by its place in the list), since an import gives new ids.
function contentOf(core: Core, candidateId: string) {
  const candidate = core.getCandidate(candidateId)!;
  const interviews = core.listInterviews(candidateId);
  const numberOf = (id: string | null) => (id === null ? null : interviews.find((i) => i.id === id)!.number);
  const saved = core.listSavedQuestions(candidateId);
  const placeOf = (id: string | null) => (id === null ? null : saved.findIndex((q) => q.id === id));
  const withNumber = <T extends { source: string }>(evidence: T) =>
    "interviewId" in evidence ? { ...evidence, interviewId: numberOf(evidence.interviewId as string) } : evidence;
  const cv = core.getCv(candidateId);
  const brief = core.getCandidateBrief(candidateId);
  return {
    name: candidate.name,
    role: candidate.role,
    cv: cv && { fileName: cv.fileName, uploadedAt: cv.uploadedAt, pages: cv.pages, bytes: core.readCvFile(candidateId)!.bytes },
    interviews: interviews.map((interview) => {
      const transcript = core.getTranscript(interview.id);
      const labels = new Map(transcript?.speakers.map((s) => [s.id, s.label]));
      const asked = core.listAskedQuestions(interview.id);
      return {
        number: interview.number,
        date: interview.date,
        time: interview.time,
        transcript: transcript && {
          fileName: transcript.fileName,
          format: transcript.format,
          importedAt: transcript.importedAt,
          speakerMappingConfirmedAt: transcript.speakerMappingConfirmedAt,
          speakers: transcript.speakers.map(({ label, role, verified }) => ({ label, role, verified })),
          segments: transcript.segments.map(({ speakerId, ...segment }) => ({ ...segment, speaker: labels.get(speakerId) })),
        },
        aiNotes: core.listAiNotes(interview.id).map((note) => without(note, "id", "interviewId")),
        askedQuestions: asked && {
          foundAt: asked.foundAt,
          stale: asked.stale,
          questions: asked.askedQuestions.map((question) => ({
            ...without(question, "id", "interviewId", "savedQuestionId"),
            savedQuestion: placeOf(question.savedQuestionId),
          })),
        },
      };
    }),
    notes: core.listInterviewerNotes(candidateId).map((n) => ({ text: n.text, savedAt: n.savedAt, interview: numberOf(n.interviewId) })),
    savedQuestions: saved.map((q) => ({ text: q.text, origin: q.origin, mark: q.mark, createdAt: q.createdAt, interview: numberOf(q.interviewId) })),
    states: core.listSavedQuestionStates(candidateId).map((state) => without(state, "savedQuestionId")),
    checks: core.listSavedQuestionChecks(candidateId).map((check) => ({
      savedQuestion: placeOf(check.savedQuestionId),
      interview: numberOf(check.interviewId),
      asked: check.askedQuestion?.question ?? null,
      stale: check.stale,
    })),
    suggestions: core.listSuggestedQuestions(candidateId).map((suggestion) => ({
      ...without(suggestion, "id", "candidateId"),
      evidence: suggestion.evidence.map(withNumber),
    })),
    missingRoleQuestions: core.listMissingRoleQuestions(candidateId).map((q) => q.text),
    brief: brief && { text: brief.text, savedAt: brief.savedAt, evidence: brief.evidence.map(withNumber) },
  };
}

// Elif Kaya with every kind of state the Interviewer and the AI client can give her data.
async function fullElif() {
  const candidate = await elif();
  const [first] = source.listInterviews(candidate.id);
  const notes = source.listAiNotes(first!.id);
  source.confirmAiNote(notes[0]!.id);
  source.correctAiNote(notes[1]!.id, "Önce Profiler'a baktı.");
  source.correctAiNote(notes[2]!.id, "Düzeltilmiş ve gizlenmiş.");
  source.dismissAiNote(notes[2]!.id);
  source.dismissAiNote(notes[3]!.id);
  source.addSavedQuestion({ candidateId: candidate.id, interviewId: first!.id, text: "Sonradan yazılan soru?" });
  source.addInterviewerNotes({ candidateId: candidate.id, text: "Birinci satır\nİkinci satır" });
  // One mark against what the Transcript says for the question, and one where it says nothing.
  const states = source.listSavedQuestionStates(candidate.id);
  source.markSavedQuestion(states.find((state) => state.transcriptState === "asked")!.savedQuestionId, "notAsked");
  source.markSavedQuestion(states.find((state) => state.transcriptState === "planned")!.savedQuestionId, "asked");

  const transcript = source.getTranscript(first!.id)!;
  const candidateSpeaker = transcript.speakers.find((s) => s.role === "candidate")!;
  const segment = transcript.segments.find((s) => s.speakerId === candidateSpeaker.id)!;
  const page = source.getCv(candidate.id)!.pages[0]!;
  const cvQuote = page.text.slice(0, 20);
  const segmentQuote = segment.text.slice(0, 15);
  source.allowAiClientWrites(true);
  const suggestions = source.saveSuggestedQuestionsFromClient(candidate.id, [
    { question: "CV sorusu?", reason: "CV'de geçiyor.", evidence: [{ source: "cv", page: page.number, quote: cvQuote }] },
    {
      question: "Görüşme sorusu?",
      reason: "Görüşmede söyledi.",
      evidence: [{ source: "transcript", interviewId: first!.id, segmentNumber: segment.number, quote: segmentQuote }],
    },
    { question: "Genel soru?", reason: "Genel.", evidence: [] },
  ]).suggestions;
  source.acceptSuggestedQuestion(suggestions[0]!.id);
  source.dismissSuggestedQuestion(suggestions[2]!.id);
  source.saveCandidateBriefFromClient(candidate.id, {
    text: "# Elif Kaya\n\nCV'de yazıyor [1], görüşmede söyledi [2].",
    evidence: [
      { number: 1, source: "cv", page: page.number, quote: cvQuote },
      { number: 2, source: "transcript", interviewId: first!.id, segmentNumber: segment.number, quote: segmentQuote },
    ],
  });
  return candidate;
}

describe("Importing a Candidate", () => {
  it("rebuilds the same Candidate in an empty app: export, import, same content", async () => {
    const candidate = await fullElif();
    const before = contentOf(source, candidate.id);

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(imported.problems).toEqual([]);
    expect(imported.candidate.id).toBe(candidate.id);
    expect(contentOf(target, imported.candidate.id)).toEqual(before);
  });

  it("keeps AI Notes and Asked Questions Stale when the Speaker Mapping changed after them", async () => {
    const candidate = await elif();
    const [first] = source.listInterviews(candidate.id);
    const transcript = source.getTranscript(first!.id)!;
    const roles = Object.fromEntries(transcript.speakers.map((s) => [s.id, s.role!]));
    source.confirmSpeakerMapping(first!.id, Object.fromEntries(transcript.speakers.map((s) => [s.id, "other" as const])));
    source.confirmSpeakerMapping(first!.id, roles);
    expect(source.listAiNotes(first!.id).every((note) => note.stale)).toBe(true);
    const before = contentOf(source, candidate.id);

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(contentOf(target, imported.candidate.id)).toEqual(before);
  });
});

describe("Importing a Candidate who is already in the app", () => {
  it("asks first: without a choice it is refused and nothing changes", async () => {
    const candidate = await elif();
    const zip = source.exportCandidate(candidate.id).bytes;
    source.addSavedQuestion({ candidateId: candidate.id, text: "Bu kopyada yazılan soru?" });
    const before = contentOf(source, candidate.id);

    const refused = source.importCandidate(zip);

    await expect(refused).rejects.toThrow(PreconditionError);
    await expect(refused).rejects.toMatchObject({ reason: "candidateExists" });
    expect(contentOf(source, candidate.id)).toEqual(before);
    expect(source.listCandidates()).toHaveLength(5);
  });

  it("replaces them when the Interviewer chooses to, and removes the earlier CV file", async () => {
    const candidate = await elif();
    const exported = contentOf(source, candidate.id);
    const zip = source.exportCandidate(candidate.id).bytes;
    source.addSavedQuestion({ candidateId: candidate.id, text: "Bu kopyada yazılan soru?" });
    const cvFiles = readdirSync(join(sourceDir, "cv-files")).length;

    const imported = await source.importCandidate(zip, { ifExists: "replace" });

    expect(imported.candidate.id).toBe(candidate.id);
    expect(contentOf(source, candidate.id)).toEqual(exported);
    expect(source.listCandidates()).toHaveLength(5);
    expect(readdirSync(join(sourceDir, "cv-files"))).toHaveLength(cvFiles);
  });

  it("keeps both when the Interviewer chooses to, as two separate Candidates", async () => {
    const candidate = await elif();
    const zip = source.exportCandidate(candidate.id).bytes;

    const imported = await source.importCandidate(zip, { ifExists: "keepBoth" });

    expect(imported.candidate.id).not.toBe(candidate.id);
    expect(contentOf(source, imported.candidate.id)).toEqual(contentOf(source, candidate.id));
    expect(source.listCandidates()).toHaveLength(6);
  });
});

describe("Checks on import", () => {
  it("does not copy the role's questions again, and offers the ones the Candidate does not have", async () => {
    const candidate = await elif();
    target.addRoleQuestion({ role: "frontend geliştirici", text: "Bu ekipteki rol sorusu?" });

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(target.listSavedQuestions(imported.candidate.id).map((q) => q.text)).toEqual(
      source.listSavedQuestions(candidate.id).map((q) => q.text),
    );
    expect(target.listMissingRoleQuestions(imported.candidate.id).map((q) => q.text)).toEqual(["Bu ekipteki rol sorusu?"]);
  });

  it("counts imported copies of the role's questions as copied, so they are not offered or added again", async () => {
    source.addRoleQuestion({ role: "Frontend Geliştirici", text: "Ortak rol sorusu?" });
    const candidate = await elif();
    target.addRoleQuestion({ role: "Frontend Geliştirici", text: "Ortak rol sorusu?" });
    target.addRoleQuestion({ role: "Frontend Geliştirici", text: "Yalnız burada olan soru?" });

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    const id = imported.candidate.id;
    expect(target.listMissingRoleQuestions(id).map((q) => q.text)).toEqual(["Yalnız burada olan soru?"]);
    target.addRoleQuestionsToCandidates("Frontend Geliştirici");
    expect(target.listSavedQuestions(id).filter((q) => q.text === "Ortak rol sorusu?")).toHaveLength(1);
  });

  it("keeps an older AI Note that was dismissed and shown again, Unreviewed, next to newer ones", async () => {
    const candidate = await elif();
    const [first] = source.listInterviews(candidate.id);
    const older = source.listAiNotes(first!.id);
    source.allowAiClientWrites(true);
    const evidence = older[0]!.evidence;
    source.dismissAiNote(older[1]!.id);
    source.saveAiNotesFromClient(first!.id, [{ statement: "Yeni nesil not.", evidence }]);
    source.restoreAiNote(older[1]!.id);
    const before = contentOf(source, candidate.id);
    expect(before.interviews[0]!.aiNotes.map((n) => n.reviewState)).toEqual(["unreviewed", "unreviewed"]);

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(imported.problems).toEqual([]);
    expect(contentOf(target, imported.candidate.id)).toEqual(before);
  });

  it("carries the time of day of each Interview", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    source.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "14:30" });
    source.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "09:00" });
    source.addInterview({ candidateId: candidate.id, date: "2026-11-05" });

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(target.listInterviews(imported.candidate.id).map((i) => [i.date, i.time])).toEqual([
      ["2026-11-03", "09:00"],
      ["2026-11-03", "14:30"],
      ["2026-11-05", null],
    ]);
  });

  it("refuses an export whose Interview has a time that is not real, or a time without a date, and saves nothing", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    source.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "14:30" });
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const [interview] = manifest.interviews as object[];

    for (const change of [{ time: "25:00" }, { date: null }]) {
      const interviews = [{ ...interview, ...change }];
      await expect(target.importCandidate(repack(files, { ...manifest, interviews }))).rejects.toThrow(InvalidInputError);
    }

    expect(target.listCandidates()).toEqual([]);
  });

  it("imports an export made before Interviews had a time", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    source.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "14:30" });
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const interviews = (manifest.interviews as { time?: string }[]).map((interview) => without(interview, "time"));

    const imported = await target.importCandidate(repack(files, { ...manifest, interviews }));

    expect(target.listInterviews(imported.candidate.id).map((i) => [i.date, i.time])).toEqual([["2026-11-03", null]]);
  });

  it("carries the Interviewer's mark on each Saved Question", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    const [asked, notAsked] = ["A?", "B?", "C?"].map((text) => source.addSavedQuestion({ candidateId: candidate.id, text }));
    source.markSavedQuestion(asked!.id, "asked");
    source.markSavedQuestion(notAsked!.id, "notAsked");

    const imported = await target.importCandidate(source.exportCandidate(candidate.id).bytes);

    expect(target.listSavedQuestions(imported.candidate.id).map((q) => [q.text, q.mark])).toEqual([
      ["A?", "asked"],
      ["B?", "notAsked"],
      ["C?", null],
    ]);
  });

  it("imports an export made before Saved Questions had a mark", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    const question = source.addSavedQuestion({ candidateId: candidate.id, text: "A?" });
    source.markSavedQuestion(question.id, "asked");
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const savedQuestions = (manifest.savedQuestions as { mark?: string }[]).map((saved) => without(saved, "mark"));

    const imported = await target.importCandidate(repack(files, { ...manifest, savedQuestions }));

    expect(target.listSavedQuestions(imported.candidate.id).map((q) => [q.text, q.mark])).toEqual([["A?", null]]);
  });

  it("refuses an export whose Saved Question has a mark that is not one of the two, and saves nothing", async () => {
    const candidate = source.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
    source.addSavedQuestion({ candidateId: candidate.id, text: "A?" });
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const savedQuestions = (manifest.savedQuestions as object[]).map((saved) => ({ ...saved, mark: "maybe" }));

    await expect(target.importCandidate(repack(files, { ...manifest, savedQuestions }))).rejects.toThrow(InvalidInputError);

    expect(target.listCandidates()).toEqual([]);
  });

  it("refuses a zip with a file its JSON does not list", async () => {
    const candidate = await elif();
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);

    await expect(target.importCandidate(repack({ ...files, "extra.txt": strToU8("?") }, manifest))).rejects.toThrow(InvalidInputError);
  });

  it("checks every AI quote again, and reports what fails instead of saving it", async () => {
    const candidate = await fullElif();
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    type Interview = { aiNotes: { statement: string; evidence: { quote: string }[] }[]; askedQuestions: { questions: { question: string; answerEvidence: { quote: string }[] }[] } };
    const [first] = manifest.interviews as Interview[];
    const note = first!.aiNotes[4]!;
    note.evidence[0]!.quote = "Bunu hiç söylemedi.";
    const asked = first!.askedQuestions.questions[0]!;
    asked.answerEvidence[0]!.quote = "Bunu da söylemedi.";
    const suggestions = manifest.suggestedQuestions as { text: string; evidence: { quote: string }[] }[];
    const suggestion = suggestions.find((s) => s.text === "Görüşme sorusu?")!;
    suggestion.evidence[0]!.quote = "Uydurma alıntı.";
    const brief = manifest.candidateBrief as { evidence: { quote: string }[] };
    brief.evidence[0]!.quote = "CV'de olmayan alıntı.";

    const imported = await target.importCandidate(repack(files, manifest));

    expect(imported.problems).toEqual([
      { kind: "aiNote", interviewNumber: 1, text: note.statement },
      { kind: "askedQuestion", interviewNumber: 1, text: asked.question },
      { kind: "suggestedQuestion", interviewNumber: null, text: "Görüşme sorusu?" },
      { kind: "briefQuote", interviewNumber: null, text: "CV'de olmayan alıntı." },
    ]);
    const id = imported.candidate.id;
    const [interview] = target.listInterviews(id);
    expect(target.listAiNotes(interview!.id).map((n) => n.statement)).not.toContain(note.statement);
    expect(target.listAiNotes(interview!.id)).toHaveLength(4);
    expect(target.listAskedQuestions(interview!.id)!.askedQuestions.map((q) => q.question)).not.toContain(asked.question);
    expect(target.listSuggestedQuestions(id).map((s) => s.text)).not.toContain("Görüşme sorusu?");
    // The brief is saved as it was written, and shows the quote as not found.
    expect(target.getCandidateBrief(id)!.evidence.map((e) => e.found)).toEqual([false, true]);
  });

  it("reads the CV again like an upload, and reports one that cannot be read, with what quotes it", async () => {
    const candidate = await fullElif();
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);

    const imported = await target.importCandidate(repack({ ...files, "cv.pdf": strToU8("not a pdf") }, manifest));

    expect(imported.problems).toEqual([
      { kind: "cv", interviewNumber: null, text: "Elif_Kaya_CV.pdf" },
      { kind: "suggestedQuestion", interviewNumber: null, text: "CV sorusu?" },
      { kind: "briefQuote", interviewNumber: null, text: expect.any(String) },
    ]);
    expect(target.getCv(imported.candidate.id)).toBeUndefined();
    expect(target.listAiNotes(target.listInterviews(imported.candidate.id)[0]!.id)).toHaveLength(5);
  });

  it("reads each Transcript again like an upload, and reports one that is refused, with its AI work", async () => {
    const candidate = await elif();
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);

    const imported = await target.importCandidate(repack({ ...files, "transcripts/interview-1.vtt": strToU8("no cues here") }, manifest));

    expect(imported.problems[0]).toEqual({ kind: "transcript", interviewNumber: 1, text: "transcript-elif-kaya.vtt" });
    expect(imported.problems.filter((p) => p.kind === "aiNote")).toHaveLength(5);
    expect(imported.problems.some((p) => p.kind === "askedQuestion")).toBe(true);
    const [interview] = target.listInterviews(imported.candidate.id);
    expect(target.getTranscript(interview!.id)).toBeUndefined();
    expect(target.listInterviewerNotes(imported.candidate.id).length).toBeGreaterThan(0);
  });

  it("refuses a file that is not a Candidate export, or is from a newer version, and saves nothing", async () => {
    const candidate = await elif();
    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const withoutCv = Object.fromEntries(Object.entries(files).filter(([path]) => path !== "cv.pdf"));

    for (const zip of [
      strToU8("not a zip"),
      zipSync({ "notes.txt": strToU8("hello") }),
      repack(files, { ...manifest, format: "something-else" }),
      repack(withoutCv, manifest),
    ]) {
      await expect(target.importCandidate(zip)).rejects.toThrow(InvalidInputError);
    }
    await expect(target.importCandidate(repack(files, { ...manifest, version: 2 }))).rejects.toThrow(/newer version/);
    expect(target.listCandidates()).toEqual([]);
  });
});

describe("Exporting a Candidate", () => {
  it("writes a Transcript imported before the original file was kept again as plain text", async () => {
    const candidate = await elif();
    const [first] = source.listInterviews(candidate.id);
    const before = source.getTranscript(first!.id)!;
    const db = new DatabaseSync(join(sourceDir, "test.sqlite"));
    db.prepare("UPDATE transcript SET original = NULL").run();
    db.close();

    const { manifest, files } = unpack(source.exportCandidate(candidate.id).bytes);
    const imported = await target.importCandidate(repack(files, manifest));

    expect(manifest.files.map((file) => file.path)).toContain("transcripts/interview-1.txt");
    expect(imported.problems).toEqual([]);
    const transcript = target.getTranscript(target.listInterviews(imported.candidate.id)[0]!.id)!;
    expect(transcript.fileName).toBe("transcript-elif-kaya.txt");
    expect(transcript.segments.map((s) => s.text)).toEqual(before.segments.map((s) => s.text));
  });


  it("makes a zip whose JSON has a format version and lists every file in the zip", async () => {
    const candidate = await elif();

    const exported = source.exportCandidate(candidate.id);

    expect(exported.fileName).toBe("Elif Kaya.zip");
    const { manifest, files } = unpack(exported.bytes);
    expect(manifest.format).toBe("interview-companion-candidate");
    expect(manifest.version).toBe(1);
    const listed = manifest.files.map((file) => file.path).sort();
    expect(listed).toEqual(Object.keys(files).filter((path) => path !== "candidate.json").sort());
    expect(listed).toEqual(["cv.pdf", "transcripts/interview-1.vtt"]);
    expect(files["cv.pdf"]).toEqual(source.readCvFile(candidate.id)!.bytes);
  });

  it("refuses a Candidate that does not exist", () => {
    expect(() => source.exportCandidate("missing")).toThrow(NotFoundError);
  });
});
