import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import type { Now } from "./interviewer-notes.ts";
import { adapterFor, transcriptAdapters, type ParsedSegment } from "./transcript-formats/index.ts";

export interface TranscriptFile {
  fileName: string;
  bytes: Uint8Array;
}

export interface TranscriptFormat {
  format: string;
  extensions: string[];
}

export interface Speaker {
  id: string;
  // The label exactly as the file wrote it, such as "Speaker 1" or a name.
  label: string;
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
    db.prepare("INSERT INTO transcript (interview_id, file_name, format, imported_at) VALUES (?, ?, ?, ?)").run(
      interviewId,
      file.fileName,
      format,
      now().toISOString(),
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

// Reads the file with the adapter for its format. Refuses a file no adapter reads, with the
// list of supported formats; then a file that is not UTF-8 text; then an empty file.
function readTranscript(file: TranscriptFile): { format: string; segments: ParsedSegment[] } {
  const adapter = adapterFor(file.fileName);
  if (!adapter) throw unsupportedFormat();
  const text = decodeUtf8(file.bytes);
  if (text.trim() === "") {
    throw new InvalidInputError("transcript", "required", "Choose a Transcript file.");
  }
  // A turn with no words says nothing, whatever format it came from.
  const segments = adapter.parse(text)?.filter((segment) => segment.text.trim() !== "");
  if (!segments || segments.length === 0) throw unsupportedFormat();
  return { format: adapter.format, segments };
}

function unsupportedFormat(): InvalidInputError {
  const formats = transcriptAdapters.map((adapter) => `${adapter.name} (${adapter.extensions.join(", ")})`);
  return new InvalidInputError(
    "transcript",
    "format",
    `This file format is not supported. Supported formats: ${formats.join("; ")}.`,
  );
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
      .prepare("SELECT id, label FROM transcript_speaker WHERE interview_id = ? ORDER BY position")
      .all(interviewId) as unknown as { id: string; label: string }[]
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
  return { interviewId: row.interview_id, fileName: row.file_name, format: row.format, importedAt: row.imported_at, speakers, segments };
}

function requireInterview(db: DatabaseSync, interviewId: string): void {
  if (!db.prepare("SELECT 1 FROM interview WHERE id = ?").get(interviewId)) {
    throw new NotFoundError("This Interview does not exist.");
  }
}
