import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Core, type Interview, type Transcript } from "./index.ts";

let dir: string;
let core: Core;
let interview: Interview;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"), { now: () => new Date("2026-11-10T09:30:00Z") });
  const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

function textFile(fileName: string, text: string) {
  return { fileName, bytes: new TextEncoder().encode(text) };
}

// Each segment as "label: text", so a test reads like the file it imported.
function linesOf(transcript: Transcript | undefined): string[] {
  const labels = new Map(transcript?.speakers.map((speaker) => [speaker.id, speaker.label]));
  return (transcript?.segments ?? []).map((segment) => `${labels.get(segment.speakerId)}: ${segment.text}`);
}

describe("Plain-text Transcript import", () => {
  it("splits a Speaker: text file into segments with their speaker labels", () => {
    core.importTranscript(
      interview.id,
      textFile(
        "first-interview.txt",
        [
          "Ayşe: Bize son projenden bahseder misin?",
          "Ece: Ödeme servislerini Node.js ile yazdım.",
          "Ayşe: Hataları nasıl yönettiniz?",
        ].join("\n"),
      ),
    );

    const transcript = core.getTranscript(interview.id);
    expect(transcript?.fileName).toBe("first-interview.txt");
    expect(transcript?.format).toBe("plain-text");
    expect(transcript?.importedAt).toBe("2026-11-10T09:30:00.000Z");
    expect(transcript?.speakers.map((speaker) => speaker.label)).toEqual(["Ayşe", "Ece"]);
    expect(linesOf(transcript)).toEqual([
      "Ayşe: Bize son projenden bahseder misin?",
      "Ece: Ödeme servislerini Node.js ile yazdım.",
      "Ayşe: Hataları nasıl yönettiniz?",
    ]);
    expect(transcript?.segments.map((segment) => segment.number)).toEqual([1, 2, 3]);
  });

  it("stores missing times as missing, never as zero", () => {
    const transcript = core.importTranscript(interview.id, textFile("t.txt", "Ayşe: Merhaba\nEce: Merhaba"));

    expect(transcript.segments.map((segment) => [segment.startMs, segment.endMs])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("leaves every speaker unverified after import", () => {
    const transcript = core.importTranscript(
      interview.id,
      textFile("t.txt", "Ayşe: Merhaba\nEce: Merhaba\nGözlemci: Ben sadece dinliyorum."),
    );

    expect(transcript.speakers).toHaveLength(3);
    expect(transcript.speakers.every((speaker) => !speaker.verified)).toBe(true);
  });

  it("joins a line without a speaker label to the turn before it, and skips blank lines", () => {
    const transcript = core.importTranscript(
      interview.id,
      textFile(
        "t.txt",
        [
          "Ayşe: Kuyruğu nasıl kurdunuz?",
          "",
          "Ece: Redis ile BullMQ kullandık.",
          "Saat 10:30 gibi yük artıyordu.",
          "10:45: Kuyruk boşaldı.",
          "",
        ].join("\r\n"),
      ),
    );

    expect(linesOf(transcript)).toEqual([
      "Ayşe: Kuyruğu nasıl kurdunuz?",
      "Ece: Redis ile BullMQ kullandık.\nSaat 10:30 gibi yük artıyordu.\n10:45: Kuyruk boşaldı.",
    ]);
  });

  it("reads a file saved with a byte-order mark, as some Windows editors do", () => {
    const transcript = core.importTranscript(interview.id, textFile("t.txt", "\uFEFFAyşe: Merhaba"));

    expect(transcript.speakers.map((speaker) => speaker.label)).toEqual(["Ayşe"]);
  });

  it("drops a turn that has no text", () => {
    const transcript = core.importTranscript(interview.id, textFile("t.txt", "Ayşe:\nGözlemci:\nEce: Hazırım."));

    expect(linesOf(transcript)).toEqual(["Ece: Hazırım."]);
    expect(transcript.speakers.map((speaker) => speaker.label)).toEqual(["Ece"]);
  });

  it("replaces the Interview's earlier Transcript when another file is imported", () => {
    core.importTranscript(interview.id, textFile("old.txt", "Ayşe: Eski metin.\nEce: Eski cevap."));

    core.importTranscript(interview.id, textFile("new.txt", "Mehmet: Yeni metin."));

    const transcript = core.getTranscript(interview.id);
    expect(transcript?.fileName).toBe("new.txt");
    expect(transcript?.speakers.map((speaker) => speaker.label)).toEqual(["Mehmet"]);
    expect(linesOf(transcript)).toEqual(["Mehmet: Yeni metin."]);
  });

  it("keeps the earlier Transcript when the new file is refused", () => {
    core.importTranscript(interview.id, textFile("old.txt", "Ayşe: Eski metin."));

    expect(() => core.importTranscript(interview.id, textFile("new.docx", "Mehmet: Yeni"))).toThrow();

    expect(linesOf(core.getTranscript(interview.id))).toEqual(["Ayşe: Eski metin."]);
  });

  it("keeps each Interview's Transcript apart", () => {
    const second = core.addInterview({ candidateId: interview.candidateId, date: "2026-11-12" });

    core.importTranscript(interview.id, textFile("first.txt", "Ayşe: Birinci."));
    core.importTranscript(second.id, textFile("second.txt", "Ayşe: İkinci."));

    expect(linesOf(core.getTranscript(interview.id))).toEqual(["Ayşe: Birinci."]);
    expect(linesOf(core.getTranscript(second.id))).toEqual(["Ayşe: İkinci."]);
  });

  it("has no Transcript for an Interview until one is imported", () => {
    expect(core.getTranscript(interview.id)).toBeUndefined();
  });

  it("deletes the Transcript with its Candidate", () => {
    core.importTranscript(interview.id, textFile("t.txt", "Ayşe: Merhaba"));

    core.deleteCandidate(interview.candidateId);

    expect(core.getTranscript(interview.id)).toBeUndefined();
  });

  it("refuses a Transcript for an Interview that does not exist", () => {
    expect(() => core.importTranscript("no-such-id", textFile("t.txt", "Ayşe: Merhaba"))).toThrow(NotFoundError);
  });
});

describe("Refused Transcript files", () => {
  it("refuses a file of an unsupported format and lists the supported formats", () => {
    const pdf = { fileName: "Interview.PDF", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xe2, 0xff, 0x00]) };
    for (const file of [textFile("notes.docx", "Ayşe: Merhaba"), pdf]) {
      expect(() => core.importTranscript(interview.id, file)).toThrow(
        expect.objectContaining({
          field: "transcript",
          rule: "format",
          message: expect.stringContaining("Supported formats: plain text (.txt)"),
        }),
      );
    }
    expect(core.getTranscript(interview.id)).toBeUndefined();
  });

  it("refuses a .txt file whose text does not start with a speaker, saying what the format expects", () => {
    for (const text of ["Toplantı notları, 3 Kasım", "Bugün iki konu konuştuk.\nAyşe: Merhaba"]) {
      expect(() => core.importTranscript(interview.id, textFile("t.txt", text))).toThrow(
        expect.objectContaining({
          field: "transcript",
          rule: "content",
          message: expect.stringContaining("Supported formats: plain text (.txt)"),
        }),
      );
    }
    expect(core.getTranscript(interview.id)).toBeUndefined();
  });

  it("refuses an empty file, or no file at all, as a missing Transcript", () => {
    for (const file of [textFile("t.txt", ""), textFile("t.txt", " \n\n "), textFile("", "")]) {
      expect(() => core.importTranscript(interview.id, file)).toThrow(
        expect.objectContaining({ field: "transcript", rule: "required" }),
      );
    }
  });

  it("refuses a file that is not UTF-8 text", () => {
    // "Ayşe: Merhaba" saved in the old Turkish Windows encoding, where ş is the single byte 0xFE.
    const windows1254 = new Uint8Array([0x41, 0x79, 0xfe, 0x65, 0x3a, 0x20, 0x4d, 0x65, 0x72, 0x68, 0x61, 0x62, 0x61]);

    expect(() => core.importTranscript(interview.id, { fileName: "t.txt", bytes: windows1254 })).toThrow(
      expect.objectContaining({ field: "transcript", rule: "encoding" }),
    );
  });

  it("lists the supported formats so the interface can show them", () => {
    expect(core.listTranscriptFormats()).toEqual([{ format: "plain-text", extensions: [".txt"] }]);
  });
});
