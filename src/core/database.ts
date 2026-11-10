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
