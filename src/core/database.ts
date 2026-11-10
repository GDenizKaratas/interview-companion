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
  `CREATE TABLE interview (
     id TEXT PRIMARY KEY,
     candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE CASCADE,
     stage TEXT NOT NULL,
     date TEXT,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX interview_candidate ON interview (candidate_id);`,
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
