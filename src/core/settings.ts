import type { DatabaseSync } from "node:sqlite";

// The setting table keeps single values by key, such as the interface language.

export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

// Returns whether the setting existed.
export function deleteSetting(db: DatabaseSync, key: string): boolean {
  return db.prepare("DELETE FROM setting WHERE key = ?").run(key).changes > 0;
}
