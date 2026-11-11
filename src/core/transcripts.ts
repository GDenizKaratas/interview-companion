import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import type { Now } from "./interviewer-notes.ts";
import { requireInterview } from "./interviews.ts";
import { adapterFor, transcriptAdapters, type ParsedSegment } from "./transcript-formats/index.ts";

export interface TranscriptFile {
  fileName: string;
  bytes: Uint8Array;
}

export interface TranscriptFormat {
  format: string;
  extensions: string[];
}

const speakerRoles = ["candidate", "interviewer", "other"] as const;
export type SpeakerRole = (typeof speakerRoles)[number];

export interface Speaker {
  id: string;
  // The label exactly as the file wrote it, such as "Speaker 1" or a name.
  label: string;
  // The role the Interviewer gave this label in the confirmed Speaker Mapping, or null before it.
  role: SpeakerRole | null;
  // False until the Interviewer confirms the Speaker Mapping.
  verified: boolean;
}

export interface Segment {
  // The segment's place in the Transcript, from 1.
  number: number;
  speakerId: string;
  text: string;
  // Milliseconds from the start of the Interview, or null when the file had no time.
  startMs: number | null;
  endMs: number | null;
}

export interface Transcript {
  interviewId: string;
  // The name of the file the Interviewer chose. Only shown.
  fileName: string;
  format: string;
  importedAt: string;
  // When the Interviewer last confirmed the Speaker Mapping, or null before that.
  speakerMappingConfirmedAt: string | null;
  // In the order they first speak.
  speakers: Speaker[];
  segments: Segment[];
}

interface TranscriptRow {
  interview_id: string;
  file_name: string;
  format: string;
  imported_at: string;
  speaker_mapping_confirmed_at: string | null;
}

interface SegmentRow {
  number: number;
  speaker_id: string;
  text: string;
  start_ms: number | null;
  end_ms: number | null;
}

export function importTranscript(db: DatabaseSync, now: Now, interviewId: string, file: TranscriptFile): Transcript {
  requireInterview(db, interviewId);
  const { format, segments } = readTranscript(file);
  // The earlier Transcript, with its speakers and segments, goes only when the new one is stored.
  inTransaction(db, () => {
    db.prepare("DELETE FROM transcript WHERE interview_id = ?").run(interviewId);
    db.prepare("INSERT INTO transcript (interview_id, file_name, format, imported_at, original) VALUES (?, ?, ?, ?, ?)").run(
      interviewId,
      file.fileName,
      format,
      now().toISOString(),
      file.bytes,
    );
    const speakerIds = new Map<string, string>();
    const insertSpeaker = db.prepare(
      "INSERT INTO transcript_speaker (id, interview_id, label, position) VALUES (?, ?, ?, ?)",
    );
    const insertSegment = db.prepare(
      "INSERT INTO transcript_segment (interview_id, number, speaker_id, text, start_ms, end_ms) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const [i, segment] of segments.entries()) {
      let speakerId = speakerIds.get(segment.speaker);
      if (speakerId === undefined) {
        speakerId = randomUUID();
        insertSpeaker.run(speakerId, interviewId, segment.speaker, speakerIds.size + 1);
        speakerIds.set(segment.speaker, speakerId);
      }
      insertSegment.run(interviewId, i + 1, speakerId, segment.text, segment.startMs, segment.endMs);
    }
  });
  return getTranscript(db, interviewId)!;
}

export function listTranscriptFormats(): TranscriptFormat[] {
  return transcriptAdapters.map((adapter) => ({ format: adapter.format, extensions: [...adapter.extensions] }));
}

// Reads the file with the adapter for its format. Refuses, in this order: no file or an empty
// one; a file no adapter reads; a file that is not UTF-8 text; and text that is not in the
// format its file ending names. The last two of these list the supported formats.
function readTranscript(file: TranscriptFile): { format: string; segments: ParsedSegment[] } {
  if (file.bytes.length === 0) throw missingFile();
  const adapter = adapterFor(file.fileName);
  if (!adapter) {
    throw new InvalidInputError("transcript", "format", `This file format is not supported. ${supportedFormats()}`);
  }
  const text = decodeUtf8(file.bytes);
  if (text.trim() === "") throw missingFile();
  // A turn with no words says nothing, whatever format it came from.
  const segments = adapter.parse(text)?.filter((segment) => segment.text.trim() !== "");
  if (!segments || segments.length === 0) {
    throw new InvalidInputError(
      "transcript",
      "content",
      `The text of this file is not in the expected form. ${supportedFormats()}`,
    );
  }
  return { format: adapter.format, segments };
}

function missingFile(): InvalidInputError {
  return new InvalidInputError("transcript", "required", "The file is empty. Choose a Transcript file.");
}

function supportedFormats(): string {
  const formats = transcriptAdapters.map((adapter) => `${adapter.name} (${adapter.extensions.join(", ")})`);
  return `Supported formats: ${formats.join("; ")}.`;
}

// Every supported format is text, so the bytes are decoded once here, for all adapters.
// A byte-order mark at the start is dropped.
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidInputError("transcript", "encoding", "This file is not UTF-8 text. Save it as UTF-8 and try again.");
  }
}

export function getTranscript(db: DatabaseSync, interviewId: string): Transcript | undefined {
  const row = db
    .prepare(
      "SELECT interview_id, file_name, format, imported_at, speaker_mapping_confirmed_at FROM transcript WHERE interview_id = ?",
    )
    .get(interviewId) as unknown as TranscriptRow | undefined;
  if (!row) return undefined;
  const verified = row.speaker_mapping_confirmed_at !== null;
  const speakers = (
    db
      .prepare("SELECT id, label, role FROM transcript_speaker WHERE interview_id = ? ORDER BY position")
      .all(interviewId) as unknown as { id: string; label: string; role: SpeakerRole | null }[]
  ).map((speaker) => ({ ...speaker, verified }));
  const segments = (
    db
      .prepare(
        "SELECT number, speaker_id, text, start_ms, end_ms FROM transcript_segment WHERE interview_id = ? ORDER BY number",
      )
      .all(interviewId) as unknown as SegmentRow[]
  ).map((segment) => ({
    number: segment.number,
    speakerId: segment.speaker_id,
    text: segment.text,
    startMs: segment.start_ms,
    endMs: segment.end_ms,
  }));
  return {
    interviewId: row.interview_id,
    fileName: row.file_name,
    format: row.format,
    importedAt: row.imported_at,
    speakerMappingConfirmedAt: row.speaker_mapping_confirmed_at,
    speakers,
    segments,
  };
}

// The Transcript file as the Interviewer chose it, or undefined when the Interview has no
// Transcript. A Transcript imported before the file was kept is written again as plain text,
// one "Speaker: text" line per segment, under the same name ending in .txt; its times are lost.
export function readTranscriptFile(db: DatabaseSync, interviewId: string): TranscriptFile | undefined {
  const row = db.prepare("SELECT file_name, original FROM transcript WHERE interview_id = ?").get(interviewId) as
    | { file_name: string; original: Uint8Array | null }
    | undefined;
  if (!row) return undefined;
  if (row.original !== null) return { fileName: row.file_name, bytes: new Uint8Array(row.original) };
  const transcript = getTranscript(db, interviewId)!;
  const labels = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.label]));
  const text = transcript.segments.map((segment) => `${labels.get(segment.speakerId)}: ${segment.text}`).join("\n");
  return { fileName: row.file_name.replace(/(\.[^.]*)?$/, ".txt"), bytes: new TextEncoder().encode(`${text}\n`) };
}

// Gives every speaker of the Interview's Transcript its role and confirms the Speaker Mapping,
// all at once. Confirming again replaces the earlier mapping.
export function confirmSpeakerMapping(
  db: DatabaseSync,
  now: Now,
  interviewId: string,
  roles: Record<string, SpeakerRole>,
): Transcript {
  requireInterview(db, interviewId);
  if (!db.prepare("SELECT 1 FROM transcript WHERE interview_id = ?").get(interviewId)) {
    throw new NotFoundError("This Interview has no Transcript.");
  }
  const stored = db
    .prepare("SELECT id, role FROM transcript_speaker WHERE interview_id = ?")
    .all(interviewId) as unknown as { id: string; role: SpeakerRole | null }[];
  const speakerIds = stored.map((speaker) => speaker.id);
  // A speaker the browser knows but the Transcript does not: most likely it was replaced meanwhile.
  if (Object.keys(roles).some((id) => !speakerIds.includes(id))) {
    throw new NotFoundError("A speaker is not in this Transcript. Reload the Transcript and try again.");
  }
  if (speakerIds.some((id) => !Object.hasOwn(roles, id))) {
    throw new InvalidInputError("speakerMapping", "required", "Give every speaker a role before confirming.");
  }
  if (speakerIds.some((id) => !(speakerRoles as readonly string[]).includes(roles[id]!))) {
    throw new InvalidInputError("speakerMapping", "format", "A speaker's role must be Candidate, Interviewer, or Other.");
  }
  // Confirming the same roles again changes nothing, so the time stays and AI Notes do not turn
  // Stale. A first confirmation always counts.
  const current = getTranscript(db, interviewId)!;
  if (current.speakerMappingConfirmedAt !== null && stored.every((speaker) => speaker.role === roles[speaker.id])) {
    return current;
  }
  inTransaction(db, () => {
    const setRole = db.prepare("UPDATE transcript_speaker SET role = ? WHERE id = ?");
    for (const id of speakerIds) setRole.run(roles[id]!, id);
    db.prepare("UPDATE transcript SET speaker_mapping_confirmed_at = ? WHERE interview_id = ?").run(
      now().toISOString(),
      interviewId,
    );
  });
  return getTranscript(db, interviewId)!;
}
