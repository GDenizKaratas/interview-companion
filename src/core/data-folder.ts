import { mkdirSync } from "node:fs";
import { posix, win32 } from "node:path";

// Where the app keeps its database (and so the API key and every Candidate). It lives in the
// user's own application-data folder, not in the project folder, so deleting or cloning the
// project again loses nothing. The choice is a pure function of the system, the environment, and
// what exists, so it is tested for every system on any one of them.

export const databaseFileName = "interview-companion.sqlite";

export interface DataFolderInput {
  // process.platform: "darwin", "win32", "linux", ...
  platform: string;
  env: Record<string, string | undefined>;
  home: string;
  // The folder of this copy of the app.
  projectRoot: string;
  exists: (path: string) => boolean;
}

// In order: DATA_DIR when it is set; the project's own data folder when a database is already
// there, as before this change (files are never moved without the user); else the system's
// application-data folder.
export function chooseDataFolder({ platform, env, home, projectRoot, exists }: DataFolderInput): string {
  const path = platform === "win32" ? win32 : posix;
  const set = (name: string) => (env[name] ? env[name] : undefined);

  const dataDir = set("DATA_DIR");
  if (dataDir) return path.resolve(dataDir);

  const projectData = path.join(projectRoot, "data");
  if (exists(path.join(projectData, databaseFileName))) return projectData;

  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Interview Companion");
  if (platform === "win32") return path.join(set("APPDATA") ?? path.join(home, "AppData", "Roaming"), "Interview Companion");
  const xdg = set("XDG_DATA_HOME");
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(home, ".local", "share"), "interview-companion");
}

// Creates the folder, with its parents, readable only by its owner where the system has such
// permissions (Windows ignores the mode; the folder is in the user's own profile there). A folder
// that is already there is left as it is.
export function ensureDataFolder(folder: string): void {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
}
