import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chooseDataFolder, ensureDataFolder } from "./data-folder.ts";

const nothingExists = () => false;

describe("The folder where the app keeps its data", () => {
  it("is the user's Application Support folder on macOS", () => {
    expect(
      chooseDataFolder({ platform: "darwin", env: {}, home: "/Users/ayse", projectRoot: "/Users/ayse/ic", exists: nothingExists }),
    ).toBe("/Users/ayse/Library/Application Support/Interview Companion");
  });

  it("is the roaming application-data folder on Windows", () => {
    expect(
      chooseDataFolder({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\Ayşe Yılmaz\\AppData\\Roaming" },
        home: "C:\\Users\\Ayşe Yılmaz",
        projectRoot: "C:\\Users\\Ayşe Yılmaz\\interview-companion",
        exists: nothingExists,
      }),
    ).toBe("C:\\Users\\Ayşe Yılmaz\\AppData\\Roaming\\Interview Companion");
  });

  it("is under the home folder on Windows when APPDATA is not set", () => {
    expect(
      chooseDataFolder({ platform: "win32", env: {}, home: "C:\\Users\\ayse", projectRoot: "C:\\ic", exists: nothingExists }),
    ).toBe("C:\\Users\\ayse\\AppData\\Roaming\\Interview Companion");
  });

  it("is XDG_DATA_HOME's folder on Linux, or ~/.local/share without it", () => {
    const linux = { platform: "linux", home: "/home/ayse", projectRoot: "/home/ayse/ic", exists: nothingExists };
    expect(chooseDataFolder({ ...linux, env: { XDG_DATA_HOME: "/data/xdg" } })).toBe("/data/xdg/interview-companion");
    expect(chooseDataFolder({ ...linux, env: {} })).toBe("/home/ayse/.local/share/interview-companion");
    // The XDG specification says a relative path is to be ignored.
    expect(chooseDataFolder({ ...linux, env: { XDG_DATA_HOME: "xdg" } })).toBe("/home/ayse/.local/share/interview-companion");
  });

  it("is DATA_DIR when it is set, on every system", () => {
    const base = { home: "/Users/ayse", projectRoot: "/Users/ayse/ic", exists: () => true };
    expect(chooseDataFolder({ ...base, platform: "darwin", env: { DATA_DIR: "/backup/ic" } })).toBe("/backup/ic");
    expect(chooseDataFolder({ ...base, platform: "win32", env: { DATA_DIR: "D:\\ic data" } })).toBe("D:\\ic data");
  });

  it("stays the project's data folder when a database is already there, so an existing user loses nothing", () => {
    const exists = (path: string) => path === "/Users/ayse/ic/data/interview-companion.sqlite";
    expect(chooseDataFolder({ platform: "darwin", env: {}, home: "/Users/ayse", projectRoot: "/Users/ayse/ic", exists })).toBe(
      "/Users/ayse/ic/data",
    );
    const windowsExists = (path: string) => path === "C:\\ic\\data\\interview-companion.sqlite";
    expect(
      chooseDataFolder({ platform: "win32", env: { APPDATA: "C:\\Roaming" }, home: "C:\\Users\\a", projectRoot: "C:\\ic", exists: windowsExists }),
    ).toBe("C:\\ic\\data");
  });

  it("treats an empty variable as not set", () => {
    expect(
      chooseDataFolder({ platform: "win32", env: { DATA_DIR: "", APPDATA: "" }, home: "C:\\Users\\a", projectRoot: "C:\\ic", exists: nothingExists }),
    ).toBe("C:\\Users\\a\\AppData\\Roaming\\Interview Companion");
  });
});

describe("Creating the data folder", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.skipIf(process.platform === "win32")("creates it, with its parents, readable only by its owner", () => {
    dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
    const folder = join(dir, "Application Support", "Interview Companion");
    ensureDataFolder(folder);
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    // Creating it again changes nothing.
    ensureDataFolder(folder);
    expect(statSync(folder).isDirectory()).toBe(true);
  });
});
