import { DatabaseSync } from "node:sqlite";

// Each entry upgrades the schema by one version. The database file stores the
// number of entries already applied in PRAGMA user_version. Never edit an entry
// that has shipped; add a new one instead.
const migrations: string[] = [
  `CREATE TABLE candidate (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     role TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;`,
  `CREATE TABLE setting (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   ) STRICT;`,
  `CREATE TABLE interview (
     id TEXT PRIMARY KEY,
     candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE CASCADE,
     number INTEGER NOT NULL,
     date TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (candidate_id, number)
   ) STRICT;`,
  // Interviews are numbered by date now; the stored value only keeps the order they were added.
  `ALTER TABLE interview RENAME COLUMN number TO added_order;`,
  `CREATE TABLE interviewer_note (
     id TEXT PRIMARY KEY,
     candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE CASCADE,
     interview_id TEXT REFERENCES interview (id) ON DELETE SET NULL,
     text TEXT NOT NULL,
     saved_at TEXT NOT NULL,
     position INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX interviewer_note_candidate ON interviewer_note (candidate_id);`,
  `CREATE TABLE saved_question (
     id TEXT PRIMARY KEY,
     candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     origin TEXT NOT NULL CHECK (origin IN ('written', 'suggestion')),
     position INTEGER NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX saved_question_candidate ON saved_question (candidate_id, position);`,
  // A Candidate has at most one CV. The file is stored under stored_name in the CV folder.
  `CREATE TABLE cv (
     candidate_id TEXT PRIMARY KEY REFERENCES candidate (id) ON DELETE CASCADE,
     file_name TEXT NOT NULL,
     stored_name TEXT NOT NULL,
     uploaded_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE cv_page (
     candidate_id TEXT NOT NULL REFERENCES cv (candidate_id) ON DELETE CASCADE,
     number INTEGER NOT NULL,
     text TEXT NOT NULL,
     PRIMARY KEY (candidate_id, number)
   ) STRICT;`,
  // An Interview has at most one Transcript. Its speakers are unverified until the Speaker
  // Mapping is confirmed. A segment's times are null when the file had none.
  `CREATE TABLE transcript (
     interview_id TEXT PRIMARY KEY REFERENCES interview (id) ON DELETE CASCADE,
     file_name TEXT NOT NULL,
     format TEXT NOT NULL,
     imported_at TEXT NOT NULL,
     speaker_mapping_confirmed_at TEXT
   ) STRICT;
   CREATE TABLE transcript_speaker (
     id TEXT PRIMARY KEY,
     interview_id TEXT NOT NULL REFERENCES transcript (interview_id) ON DELETE CASCADE,
     label TEXT NOT NULL,
     position INTEGER NOT NULL,
     UNIQUE (interview_id, label)
   ) STRICT;
   CREATE TABLE transcript_segment (
     interview_id TEXT NOT NULL REFERENCES transcript (interview_id) ON DELETE CASCADE,
     number INTEGER NOT NULL,
     speaker_id TEXT NOT NULL REFERENCES transcript_speaker (id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     start_ms INTEGER,
     end_ms INTEGER,
     PRIMARY KEY (interview_id, number)
   ) STRICT;`,
  // A speaker's role in the Speaker Mapping. NULL until the Interviewer confirms the mapping.
  `ALTER TABLE transcript_speaker ADD COLUMN role TEXT CHECK (role IN ('candidate', 'interviewer', 'other'));`,
  // AI Notes belong to an Interview's Transcript: each quote points to one of its segments by
  // number, so replacing the Transcript removes them. Evidence keeps the exact quote.
  `CREATE TABLE ai_note (
     id TEXT PRIMARY KEY,
     interview_id TEXT NOT NULL REFERENCES transcript (interview_id) ON DELETE CASCADE,
     statement TEXT NOT NULL,
     review_state TEXT NOT NULL CHECK (review_state IN ('unreviewed', 'confirmed', 'corrected', 'dismissed')),
     generated_at TEXT NOT NULL,
     position INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX ai_note_interview ON ai_note (interview_id, position);
   CREATE TABLE ai_note_evidence (
     ai_note_id TEXT NOT NULL REFERENCES ai_note (id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     segment_number INTEGER NOT NULL,
     quote TEXT NOT NULL,
     PRIMARY KEY (ai_note_id, position)
   ) STRICT;`,
  // The Interviewer's rewrite of an AI Note. The AI's statement stays as it was generated.
  `ALTER TABLE ai_note ADD COLUMN correction TEXT;`,
  // Suggested Questions belong to a Candidate. Each quote points to the CV or to one Interview's
  // Transcript; replacing that source removes the quote, and the trigger then removes the whole
  // suggestion, so a suggestion never loses Evidence and quietly looks general. Saved Questions
  // are copies in their own table, so nothing here can change them.
  `CREATE TABLE suggested_question (
     id TEXT PRIMARY KEY,
     candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     reason TEXT NOT NULL,
     generated_at TEXT NOT NULL,
     position INTEGER NOT NULL,
     accepted_at TEXT,
     dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1))
   ) STRICT;
   CREATE INDEX suggested_question_candidate ON suggested_question (candidate_id, position);
   CREATE TABLE suggested_question_evidence (
     suggested_question_id TEXT NOT NULL REFERENCES suggested_question (id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     cv_candidate_id TEXT REFERENCES cv (candidate_id) ON DELETE CASCADE,
     cv_page INTEGER,
     transcript_interview_id TEXT REFERENCES transcript (interview_id) ON DELETE CASCADE,
     segment_number INTEGER,
     quote TEXT NOT NULL,
     PRIMARY KEY (suggested_question_id, position),
     CHECK ((cv_candidate_id IS NOT NULL AND cv_page IS NOT NULL AND transcript_interview_id IS NULL AND segment_number IS NULL)
         OR (cv_candidate_id IS NULL AND cv_page IS NULL AND transcript_interview_id IS NOT NULL AND segment_number IS NOT NULL))
   ) STRICT;
   CREATE TRIGGER suggested_question_source_replaced AFTER DELETE ON suggested_question_evidence
   BEGIN
     DELETE FROM suggested_question WHERE id = OLD.suggested_question_id;
   END;`,
];

// Opens the database file and brings its schema up to date. created is true when the file
// was new, or empty, before this call.
export function openDatabase(path: string): { db: DatabaseSync; created: boolean } {
  // The web server, the MCP server, and `npm run demo` can have the file open at once, so a
  // connection waits up to five seconds for another one to finish instead of failing at once.
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec("PRAGMA foreign_keys = ON;");
  const created = schemaVersion(db) === 0;
  migrate(db);
  return { db, created };
}

function schemaVersion(db: DatabaseSync): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function migrate(db: DatabaseSync): void {
  for (let version = schemaVersion(db); version < migrations.length; version++) {
    inTransaction(db, () => {
      db.exec(migrations[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

// Runs work so that all of its changes are saved together or not at all. It uses a savepoint
// instead of BEGIN, so one operation can call others that also use it, such as loading the
// demo Candidate, which adds Interviews and notes.
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("SAVEPOINT work");
  try {
    const result = work();
    db.exec("RELEASE work");
    return result;
  } catch (error) {
    // Some errors make SQLite roll back the whole transaction itself, and then the savepoint
    // is gone. The original error is what the caller needs to see, so it is always rethrown.
    try {
      db.exec("ROLLBACK TO work");
      db.exec("RELEASE work");
    } catch {
      // Nothing is left to undo.
    }
    throw error;
  }
}
