import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { confirmAiNote, correctAiNote, dismissAiNote, listAiNotes, saveCheckedAiNotes } from "./ai-notes.ts";
import { listAskedQuestions, saveCheckedAskedQuestions } from "./asked-questions.ts";
import { getCandidateBrief, saveCandidateBrief } from "./candidate-brief.ts";
import { deleteCandidateIfExists, getCandidate, insertCandidateRow, requireCandidate, type Candidate } from "./candidates.ts";
import { acceptCv, getCv, readCvFile, storeCv, storedFileName, type AcceptedCv } from "./cv.ts";
import { inTransaction } from "./database.ts";
import { InvalidInputError, PreconditionError } from "./errors.ts";
import { addInterviewerNotes, listInterviewerNotes, type Now } from "./interviewer-notes.ts";
import { addInterview, listInterviews, type Today } from "./interviews.ts";
import { insertSavedQuestion, listSavedQuestions } from "./saved-questions.ts";
import {
  dismissSuggestedQuestion,
  listSuggestedQuestions,
  markSuggestionAccepted,
  saveCheckedSuggestedQuestions,
} from "./suggested-questions.ts";
import { confirmSpeakerMapping, getTranscript, importTranscript, readTranscriptFile, type SpeakerRole } from "./transcripts.ts";

// A Candidate export is one zip: the CV and each Transcript as their original files, and
// candidate.json with everything else. Importing it rebuilds the Candidate through core's own
// operations, so every rule and every quote check applies again.

export interface CandidateExport {
  // A name for the downloaded file, made from the Candidate's name.
  fileName: string;
  bytes: Uint8Array;
}

// What to do when the Candidate in the zip is already in the app: replace them, or add the
// import next to them as a separate Candidate. Without a choice, the import is refused.
export type ExistingCandidate = "replace" | "keepBoth";

export interface ImportOptions {
  ifExists?: ExistingCandidate;
}

// Something in the zip that was not saved, because it failed a check, or a Candidate Brief quote
// that is not found in the imported sources (the brief itself is saved).
export interface ImportProblem {
  kind: "cv" | "transcript" | "speakerMapping" | "aiNote" | "askedQuestion" | "suggestedQuestion" | "briefQuote";
  // The Interview it belongs to, by its number, or null for the Candidate as a whole.
  interviewNumber: number | null;
  // What was not saved: a file name, a statement, a question, or a quote.
  text: string;
}

export interface CandidateImport {
  candidate: Candidate;
  problems: ImportProblem[];
}

const manifestPath = "candidate.json";
const format = "interview-companion-candidate";
const version = 1;
// A zip larger than this when unpacked is refused before it is unpacked.
const maxUnpackedBytes = 200 * 1024 * 1024;

const time = z.iso.datetime();
const source = z.enum(["app", "aiClient"]);
const segmentQuote = z.object({ segmentNumber: z.number().int(), quote: z.string() });
const sourceQuote = z.discriminatedUnion("source", [
  z.object({ source: z.literal("cv"), page: z.number().int(), quote: z.string() }),
  z.object({ source: z.literal("transcript"), interviewId: z.string(), segmentNumber: z.number().int(), quote: z.string() }),
]);

// The shape of candidate.json, version 1. Ids are those of the app that exported it; they only
// link the parts of the file to each other, and the import gives everything new ids, except the
// Candidate, whose id tells whether they are already in the app.
const manifestSchema = z.object({
  format: z.literal(format),
  version: z.literal(version),
  exportedAt: time,
  files: z.array(z.object({ path: z.string(), kind: z.enum(["cv", "transcript"]), fileName: z.string() })),
  candidate: z.object({ id: z.string().min(1), name: z.string(), role: z.string() }),
  cv: z.object({ file: z.string(), uploadedAt: time }).nullable(),
  interviews: z.array(
    z.object({
      id: z.string(),
      date: z.string().nullable(),
      transcript: z
        .object({
          file: z.string(),
          importedAt: time,
          speakerMappingConfirmedAt: time.nullable(),
          speakers: z.array(z.object({ label: z.string(), role: z.enum(["candidate", "interviewer", "other"]).nullable() })),
        })
        .nullable(),
      aiNotes: z.array(
        z.object({
          statement: z.string(),
          correction: z.string().nullable(),
          reviewState: z.enum(["unreviewed", "confirmed", "corrected", "dismissed"]),
          generatedAt: time,
          source,
          evidence: z.array(segmentQuote),
        }),
      ),
      askedQuestions: z
        .object({
          foundAt: time,
          source,
          checkedSavedQuestionIds: z.array(z.string()),
          questions: z.array(
            z.object({
              question: z.string(),
              questionEvidence: segmentQuote,
              savedQuestionId: z.string().nullable(),
              answerSummary: z.string(),
              answerEvidence: z.array(segmentQuote),
            }),
          ),
        })
        .nullable(),
    }),
  ),
  interviewerNotes: z.array(z.object({ interviewId: z.string().nullable(), text: z.string(), savedAt: time })),
  savedQuestions: z.array(
    z.object({
      id: z.string(),
      interviewId: z.string().nullable(),
      text: z.string(),
      origin: z.enum(["written", "suggestion", "role"]),
      createdAt: time,
    }),
  ),
  suggestedQuestions: z.array(
    z.object({
      text: z.string(),
      reason: z.string(),
      generatedAt: time,
      source,
      acceptedAt: time.nullable(),
      dismissed: z.boolean(),
      evidence: z.array(sourceQuote),
    }),
  ),
  candidateBrief: z
    .object({ text: z.string(), savedAt: time, evidence: z.array(sourceQuote.and(z.object({ number: z.number().int() }))) })
    .nullable(),
});

type Manifest = z.infer<typeof manifestSchema>;

export function exportCandidate(db: DatabaseSync, folder: string, today: Today, now: Now, candidateId: string): CandidateExport {
  const candidate = requireCandidate(db, candidateId);
  const files: Record<string, Uint8Array> = {};
  const listed: Manifest["files"] = [];
  // Each file is stored under a name made by core; the name the Interviewer chose is in the JSON.
  const addFile = (path: string, kind: "cv" | "transcript", file: { fileName: string; bytes: Uint8Array }) => {
    files[path] = file.bytes;
    listed.push({ path, kind, fileName: file.fileName });
    return path;
  };

  const cv = getCv(db, candidateId);
  const cvEntry = cv ? { file: addFile("cv.pdf", "cv", readCvFile(db, folder, candidateId)!), uploadedAt: cv.uploadedAt } : null;
  const checkedOf = db.prepare("SELECT saved_question_id FROM asked_question_checked WHERE interview_id = ?");
  const runSourceOf = db.prepare("SELECT source FROM asked_question_run WHERE interview_id = ?");

  const interviews = listInterviews(db, today, candidateId).map((interview): Manifest["interviews"][number] => {
    const transcript = getTranscript(db, interview.id);
    if (!transcript) return { id: interview.id, date: interview.date, transcript: null, aiNotes: [], askedQuestions: null };
    const file = readTranscriptFile(db, interview.id)!;
    const asked = listAskedQuestions(db, interview.id);
    return {
      id: interview.id,
      date: interview.date,
      transcript: {
        file: addFile(`transcripts/interview-${interview.number}${extensionOf(file.fileName)}`, "transcript", file),
        importedAt: transcript.importedAt,
        speakerMappingConfirmedAt: transcript.speakerMappingConfirmedAt,
        speakers: transcript.speakers.map((speaker) => ({ label: speaker.label, role: speaker.role })),
      },
      aiNotes: listAiNotes(db, interview.id).map((note) => ({
        statement: note.statement,
        correction: note.correction,
        reviewState: note.reviewState,
        generatedAt: note.generatedAt,
        source: note.source,
        evidence: note.evidence,
      })),
      askedQuestions: asked && {
        foundAt: asked.foundAt,
        source: (runSourceOf.get(interview.id) as { source: "app" | "aiClient" }).source,
        checkedSavedQuestionIds: (checkedOf.all(interview.id) as { saved_question_id: string }[]).map((row) => row.saved_question_id),
        questions: asked.askedQuestions.map((question) => ({
          question: question.question,
          questionEvidence: question.questionEvidence,
          savedQuestionId: question.savedQuestionId,
          answerSummary: question.answerSummary,
          answerEvidence: question.answerEvidence,
        })),
      },
    };
  });

  const acceptedAt = new Map(
    (
      db.prepare("SELECT id, accepted_at FROM suggested_question WHERE candidate_id = ?").all(candidateId) as {
        id: string;
        accepted_at: string | null;
      }[]
    ).map((row) => [row.id, row.accepted_at]),
  );
  const brief = getCandidateBrief(db, candidateId);
  const manifest: Manifest = {
    format,
    version,
    exportedAt: now().toISOString(),
    files: listed,
    candidate: { id: candidate.id, name: candidate.name, role: candidate.role },
    cv: cvEntry,
    interviews,
    interviewerNotes: listInterviewerNotes(db, candidateId).map((note) => ({
      interviewId: note.interviewId,
      text: note.text,
      savedAt: note.savedAt,
    })),
    savedQuestions: listSavedQuestions(db, candidateId).map((question) => ({
      id: question.id,
      interviewId: question.interviewId,
      text: question.text,
      origin: question.origin,
      createdAt: question.createdAt,
    })),
    suggestedQuestions: listSuggestedQuestions(db, candidateId).map((suggestion) => ({
      text: suggestion.text,
      reason: suggestion.reason,
      generatedAt: suggestion.generatedAt,
      source: suggestion.source,
      acceptedAt: acceptedAt.get(suggestion.id) ?? null,
      dismissed: suggestion.dismissed,
      evidence: suggestion.evidence,
    })),
    candidateBrief: brief && {
      text: brief.text,
      savedAt: brief.savedAt,
      evidence: brief.evidence.map((evidence) =>
        evidence.source === "cv"
          ? { number: evidence.number, source: "cv", page: evidence.page, quote: evidence.quote }
          : {
              number: evidence.number,
              source: "transcript",
              interviewId: evidence.interviewId,
              segmentNumber: evidence.segmentNumber,
              quote: evidence.quote,
            },
      ),
    },
  };
  return {
    fileName: `${candidate.name}.zip`,
    bytes: zipSync({ ...files, [manifestPath]: strToU8(JSON.stringify(manifest, null, 2)) }),
  };
}

// ".vtt" for "interview.vtt", or "" when the name has no ending.
function extensionOf(fileName: string): string {
  return /\.[^./\\]+$/.exec(fileName)?.[0].toLowerCase() ?? "";
}

export async function importCandidate(
  db: DatabaseSync,
  folder: string,
  today: Today,
  zip: Uint8Array,
  options: ImportOptions = {},
): Promise<CandidateImport> {
  const { manifest, files } = readZip(zip);
  const existing = getCandidate(db, manifest.candidate.id);
  if (existing && options.ifExists === undefined) {
    throw new PreconditionError("candidateExists", `${existing.name} is already in the app. Replace them, or keep both.`);
  }
  const replace = existing !== undefined && options.ifExists === "replace";
  const candidateId = existing && !replace ? randomUUID() : manifest.candidate.id;
  const problems: ImportProblem[] = [];

  // The CV is read the same way as an upload, before any change, because reading a PDF cannot
  // happen inside a database transaction.
  let cv: AcceptedCv | undefined;
  if (manifest.cv) {
    const fileName = fileNameOf(manifest, manifest.cv.file);
    try {
      cv = await acceptCv({ fileName, bytes: files[manifest.cv.file]! });
    } catch (error) {
      if (!(error instanceof InvalidInputError)) throw error;
      problems.push({ kind: "cv", interviewNumber: null, text: fileName });
    }
  }

  const replacedCvFile = replace ? storedFileName(db, candidateId) : undefined;
  // An imported Candidate brings their own Saved Questions, so the role's questions are not
  // copied again; the Workspace offers the ones they do not have.
  const addCandidate = () => {
    if (replace) deleteCandidateIfExists(db, candidateId);
    return insertCandidateRow(db, candidateId, manifest.candidate);
  };
  const addContent = (candidate: Candidate) => rebuild(db, today, candidate.id, manifest, files, problems);
  let candidate: Candidate;
  if (cv) {
    const replaced = replacedCvFile === undefined ? [] : [replacedCvFile];
    candidate = storeCv(db, folder, at(manifest.cv!.uploadedAt), cv, addCandidate, replaced, addContent);
  } else {
    candidate = inTransaction(db, () => {
      const added = addCandidate();
      addContent(added);
      return added;
    });
    if (replacedCvFile !== undefined) rmSync(join(folder, replacedCvFile), { force: true });
  }
  return { candidate, problems: [...problems, ...briefProblems(db, today, candidate.id)] };
}

// Unpacks the zip and checks candidate.json, or refuses a file that is not a Candidate export
// this version of the app can read.
function readZip(zip: Uint8Array): { manifest: Manifest; files: Record<string, Uint8Array> } {
  const notAnExport = () =>
    new InvalidInputError("candidateExport", "format", "This file is not a Candidate export from Interview Companion.");
  let files: Record<string, Uint8Array>;
  try {
    let unpacked = 0;
    files = unzipSync(zip, {
      filter: (file) => {
        unpacked += file.originalSize;
        if (unpacked > maxUnpackedBytes) throw new Error("too large");
        return true;
      },
    });
  } catch {
    throw notAnExport();
  }
  const json = files[manifestPath];
  if (!json) throw notAnExport();
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(json));
  } catch {
    throw notAnExport();
  }
  const header = z.object({ format: z.literal(format), version: z.number() }).safeParse(parsed);
  if (!header.success) throw notAnExport();
  if (header.data.version > version) {
    throw new InvalidInputError(
      "candidateExportVersion",
      "format",
      "This export was made by a newer version of Interview Companion. Update the app to import it.",
    );
  }
  const manifest = manifestSchema.safeParse(parsed);
  if (!manifest.success) throw notAnExport();
  // Every file the JSON names must be listed, and every listed file must be in the zip.
  const listed = new Set(manifest.data.files.map((file) => file.path));
  const named = [manifest.data.cv?.file, ...manifest.data.interviews.map((interview) => interview.transcript?.file)];
  if (named.some((path) => path !== undefined && !listed.has(path)) || [...listed].some((path) => !files[path])) {
    throw notAnExport();
  }
  return { manifest: manifest.data, files };
}

function fileNameOf(manifest: Manifest, path: string): string {
  return manifest.files.find((file) => file.path === path)!.fileName;
}

// A clock fixed at a time from the zip, so what is rebuilt keeps the time it was first made.
// Keeping the times also keeps what depends on them, such as which AI Notes are Stale.
function at(time: string): Now {
  return () => new Date(time);
}

// Adds everything about the Candidate, in an order that lets each part point to the ones
// before: Interviews, Saved Questions, Interviewer Notes, Transcripts with their Speaker
// Mapping, AI Notes and Asked Questions, Suggested Questions, and the Candidate Brief. Runs inside
// the import's transaction. Problems are added to the list given.
function rebuild(
  db: DatabaseSync,
  today: Today,
  candidateId: string,
  manifest: Manifest,
  files: Record<string, Uint8Array>,
  problems: ImportProblem[],
): void {
  const interviewIds = new Map<string, string>();
  for (const interview of manifest.interviews) {
    interviewIds.set(interview.id, addInterview(db, today, { candidateId, date: interview.date }).id);
  }
  const numbers = new Map(listInterviews(db, today, candidateId).map((interview) => [interview.id, interview.number]));
  const newInterview = (id: string | null) => (id === null ? null : (interviewIds.get(id) ?? null));
  const numberOf = (exportedId: string) => numbers.get(interviewIds.get(exportedId)!) ?? null;

  const savedIds = new Map<string, string>();
  for (const question of manifest.savedQuestions) {
    const saved = insertSavedQuestion(db, candidateId, question.text, question.origin, question.createdAt, newInterview(question.interviewId));
    savedIds.set(question.id, saved.id);
  }

  // Lines saved together, at one time for one Interview, are added together, so they keep their order.
  const notes = manifest.interviewerNotes;
  for (let i = 0; i < notes.length; ) {
    let end = i + 1;
    while (end < notes.length && notes[end]!.savedAt === notes[i]!.savedAt && notes[end]!.interviewId === notes[i]!.interviewId) end++;
    addInterviewerNotes(db, at(notes[i]!.savedAt), {
      candidateId,
      interviewId: newInterview(notes[i]!.interviewId),
      text: notes
        .slice(i, end)
        .map((note) => note.text)
        .join("\n"),
    });
    i = end;
  }

  for (const interview of manifest.interviews) {
    const interviewId = interviewIds.get(interview.id)!;
    const number = numberOf(interview.id);
    if (rebuildTranscript(db, interviewId, number, interview, manifest, files, problems)) {
      rebuildAiNotes(db, interviewId, number, interview.aiNotes, problems);
      rebuildAskedQuestions(db, interviewId, number, interview.askedQuestions, savedIds, problems);
    } else {
      // Without a confirmed Transcript there is nothing to check AI work against.
      for (const note of interview.aiNotes) problems.push({ kind: "aiNote", interviewNumber: number, text: note.statement });
      for (const question of interview.askedQuestions?.questions ?? []) {
        problems.push({ kind: "askedQuestion", interviewNumber: number, text: question.question });
      }
    }
  }

  rebuildSuggestedQuestions(db, today, candidateId, manifest.suggestedQuestions, interviewIds, problems);

  if (manifest.candidateBrief) {
    const brief = manifest.candidateBrief;
    saveCandidateBrief(db, at(brief.savedAt), candidateId, {
      text: brief.text,
      evidence: brief.evidence.map((evidence) =>
        evidence.source === "cv" ? evidence : { ...evidence, interviewId: interviewIds.get(evidence.interviewId) ?? evidence.interviewId },
      ),
    });
  }
}

// Reads the Transcript file again with the same code as an upload, and confirms the Speaker
// Mapping the zip names for its speakers. Returns whether the Transcript is there and confirmed.
function rebuildTranscript(
  db: DatabaseSync,
  interviewId: string,
  number: number | null,
  interview: Manifest["interviews"][number],
  manifest: Manifest,
  files: Record<string, Uint8Array>,
  problems: ImportProblem[],
): boolean {
  const exported = interview.transcript;
  if (!exported) return false;
  const fileName = fileNameOf(manifest, exported.file);
  let transcript;
  try {
    transcript = importTranscript(db, at(exported.importedAt), interviewId, { fileName, bytes: files[exported.file]! });
  } catch (error) {
    if (!(error instanceof InvalidInputError)) throw error;
    problems.push({ kind: "transcript", interviewNumber: number, text: fileName });
    return false;
  }
  if (exported.speakerMappingConfirmedAt === null) return false;
  const roles = new Map(exported.speakers.map((speaker) => [speaker.label, speaker.role]));
  const mapping: Record<string, SpeakerRole> = {};
  for (const speaker of transcript.speakers) {
    const role = roles.get(speaker.label);
    if (!role) {
      problems.push({ kind: "speakerMapping", interviewNumber: number, text: fileName });
      return false;
    }
    mapping[speaker.id] = role;
  }
  confirmSpeakerMapping(db, at(exported.speakerMappingConfirmedAt), interviewId, mapping);
  return true;
}

// Saves each generation of AI Notes through the quote check, oldest first, then gives each note
// its Review State through the same operations the Interviewer uses.
function rebuildAiNotes(
  db: DatabaseSync,
  interviewId: string,
  number: number | null,
  notes: Manifest["interviews"][number]["aiNotes"],
  problems: ImportProblem[],
): void {
  for (const generation of generationsOf(notes, (note) => `${note.generatedAt}|${note.source}`)) {
    const { generatedAt, source } = generation[0]!;
    saveCheckedAiNotes(db, at(generatedAt), interviewId, generation, source);
    const saved = listAiNotes(db, interviewId).filter((note) => note.generatedAt === generatedAt && note.reviewState === "unreviewed");
    for (const note of generation) {
      const match = saved.findIndex(
        (candidate) => candidate.statement === note.statement.trim() && sameQuotes(candidate.evidence, note.evidence),
      );
      if (match === -1) {
        problems.push({ kind: "aiNote", interviewNumber: number, text: note.statement });
        continue;
      }
      const { id } = saved.splice(match, 1)[0]!;
      if (note.correction !== null && note.reviewState !== "confirmed") correctAiNote(db, id, note.correction);
      if (note.reviewState === "confirmed") confirmAiNote(db, id);
      if (note.reviewState === "dismissed") dismissAiNote(db, id);
    }
  }
}

function rebuildAskedQuestions(
  db: DatabaseSync,
  interviewId: string,
  number: number | null,
  asked: Manifest["interviews"][number]["askedQuestions"],
  savedIds: Map<string, string>,
  problems: ImportProblem[],
): void {
  if (!asked) return;
  const proposed = asked.questions.map((question) => ({
    ...question,
    savedQuestionId: question.savedQuestionId === null ? null : (savedIds.get(question.savedQuestionId) ?? null),
  }));
  const checked = asked.checkedSavedQuestionIds.flatMap((id) => savedIds.get(id) ?? []);
  const result = saveCheckedAskedQuestions(db, at(asked.foundAt), interviewId, proposed, asked.source, checked);
  const saved = [...result.askedQuestions];
  for (const question of proposed) {
    const match = saved.findIndex(
      (candidate) =>
        candidate.question === question.question.trim() &&
        sameQuotes([candidate.questionEvidence], [question.questionEvidence]) &&
        sameQuotes(candidate.answerEvidence, question.answerEvidence),
    );
    if (match === -1) problems.push({ kind: "askedQuestion", interviewNumber: number, text: question.question });
    else saved.splice(match, 1);
  }
}

// Saves each generation of Suggested Questions through the quote check, oldest first, then marks
// the accepted and dismissed ones. An accepted one is only marked: its copy is among the Saved
// Questions already.
function rebuildSuggestedQuestions(
  db: DatabaseSync,
  today: Today,
  candidateId: string,
  suggestions: Manifest["suggestedQuestions"],
  interviewIds: Map<string, string>,
  problems: ImportProblem[],
): void {
  const mapped = suggestions.map((suggestion) => ({
    ...suggestion,
    question: suggestion.text,
    evidence: suggestion.evidence.map((evidence) =>
      evidence.source === "cv" ? evidence : { ...evidence, interviewId: interviewIds.get(evidence.interviewId) ?? evidence.interviewId },
    ),
  }));
  for (const generation of generationsOf(mapped, (suggestion) => `${suggestion.generatedAt}|${suggestion.source}`)) {
    const { generatedAt, source } = generation[0]!;
    saveCheckedSuggestedQuestions(db, today, at(generatedAt), candidateId, generation, source);
    const saved = listSuggestedQuestions(db, candidateId).filter(
      (suggestion) => suggestion.generatedAt === generatedAt && !suggestion.accepted,
    );
    for (const suggestion of generation) {
      const match = saved.findIndex(
        (candidate) =>
          candidate.text === suggestion.text.trim() &&
          candidate.reason === suggestion.reason.trim() &&
          JSON.stringify(candidate.evidence) === JSON.stringify(suggestion.evidence),
      );
      if (match === -1) {
        problems.push({ kind: "suggestedQuestion", interviewNumber: null, text: suggestion.text });
        continue;
      }
      const { id } = saved.splice(match, 1)[0]!;
      if (suggestion.acceptedAt !== null) markSuggestionAccepted(db, id, suggestion.acceptedAt);
      if (suggestion.dismissed) dismissSuggestedQuestion(db, id);
    }
  }
}

// The Candidate Brief is saved as it was written; a quote not found in the imported CV or
// Transcripts is reported, and the brief shows it as not found, as it would after any change.
function briefProblems(db: DatabaseSync, today: Today, candidateId: string): ImportProblem[] {
  const brief = getCandidateBrief(db, candidateId);
  if (!brief) return [];
  const numbers = new Map(listInterviews(db, today, candidateId).map((interview) => [interview.id, interview.number]));
  return brief.evidence
    .filter((evidence) => !evidence.found)
    .map((evidence) => ({
      kind: "briefQuote" as const,
      interviewNumber: evidence.source === "cv" ? null : (numbers.get(evidence.interviewId) ?? null),
      text: evidence.quote,
    }));
}

// Items made in the same generation, grouped, oldest generation first, each in its order.
function generationsOf<T extends { generatedAt: string }>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.values()].sort((a, b) => a[0]!.generatedAt.localeCompare(b[0]!.generatedAt));
}

function sameQuotes(a: { segmentNumber: number; quote: string }[], b: { segmentNumber: number; quote: string }[]): boolean {
  return a.length === b.length && a.every((quote, i) => quote.segmentNumber === b[i]!.segmentNumber && quote.quote === b[i]!.quote);
}
