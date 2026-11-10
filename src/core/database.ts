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
];

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = row.user_version; version < migrations.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
    db.exec("ROLLBACK TO work");
    db.exec("RELEASE work");
    throw error;
  }
}
