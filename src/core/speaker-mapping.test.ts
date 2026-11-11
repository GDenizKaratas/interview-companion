import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Core, type Interview, type Transcript } from "./index.ts";

let dir: string;
let core: Core;
let interview: Interview;
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  clock = new Date("2026-11-10T09:30:00Z");
  core = openCore(join(dir, "test.sqlite"), { now: () => clock });
  const candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

function importThreeSpeakers(): Transcript {
  const text = ["Ayşe: Bize son projenden bahseder misin?", "Ece: Ödeme servislerini yazdım.", "Gözlemci: Not alıyorum."];
  return core.importTranscript(interview.id, { fileName: "t.txt", bytes: new TextEncoder().encode(text.join("\n")) });
}

// The speakers' ids by label, so a test can name speakers the way the file did.
function idsByLabel(transcript: Transcript): Record<string, string> {
  return Object.fromEntries(transcript.speakers.map((speaker) => [speaker.label, speaker.id]));
}

// Each speaker as "label: role, verified or unverified", so a test reads like the panel.
function speakersOf(transcript: Transcript | undefined): string[] {
  return (transcript?.speakers ?? []).map(
    (speaker) => `${speaker.label}: ${speaker.role ?? "no role"}, ${speaker.verified ? "verified" : "unverified"}`,
  );
}

describe("Speaker Mapping", () => {
  it("has no roles and no confirmation after import", () => {
    const transcript = importThreeSpeakers();

    expect(speakersOf(transcript)).toEqual([
      "Ayşe: no role, unverified",
      "Ece: no role, unverified",
      "Gözlemci: no role, unverified",
    ]);
    expect(transcript.speakerMappingConfirmedAt).toBeNull();
  });

  it("gives each speaker label a role and confirms the mapping", () => {
    const ids = idsByLabel(importThreeSpeakers());

    core.confirmSpeakerMapping(interview.id, {
      [ids["Ayşe"]!]: "interviewer",
      [ids["Ece"]!]: "candidate",
      [ids["Gözlemci"]!]: "other",
    });

    const transcript = core.getTranscript(interview.id);
    expect(speakersOf(transcript)).toEqual([
      "Ayşe: interviewer, verified",
      "Ece: candidate, verified",
      "Gözlemci: other, verified",
    ]);
    expect(transcript?.speakerMappingConfirmedAt).toBe("2026-11-10T09:30:00.000Z");
  });

  it("changes a confirmed mapping when the Interviewer confirms new roles", () => {
    const ids = idsByLabel(importThreeSpeakers());
    // The file gave the Interviewer's words to "Ece" by mistake; at first it is mapped that way.
    core.confirmSpeakerMapping(interview.id, {
      [ids["Ayşe"]!]: "candidate",
      [ids["Ece"]!]: "interviewer",
      [ids["Gözlemci"]!]: "other",
    });
    clock = new Date("2026-11-10T10:00:00Z");

    core.confirmSpeakerMapping(interview.id, {
      [ids["Ayşe"]!]: "interviewer",
      [ids["Ece"]!]: "candidate",
      [ids["Gözlemci"]!]: "other",
    });

    const transcript = core.getTranscript(interview.id);
    expect(speakersOf(transcript)).toEqual([
      "Ayşe: interviewer, verified",
      "Ece: candidate, verified",
      "Gözlemci: other, verified",
    ]);
    expect(transcript?.speakerMappingConfirmedAt).toBe("2026-11-10T10:00:00.000Z");
  });

  it("refuses a mapping that leaves a speaker without a role, and keeps the earlier mapping", () => {
    const ids = idsByLabel(importThreeSpeakers());

    expect(() =>
      core.confirmSpeakerMapping(interview.id, { [ids["Ayşe"]!]: "interviewer", [ids["Ece"]!]: "candidate" }),
    ).toThrow(expect.objectContaining({ field: "speakerMapping", rule: "required" }));

    const transcript = core.getTranscript(interview.id);
    expect(speakersOf(transcript)).toEqual([
      "Ayşe: no role, unverified",
      "Ece: no role, unverified",
      "Gözlemci: no role, unverified",
    ]);
    expect(transcript?.speakerMappingConfirmedAt).toBeNull();
  });

  it("refuses a mapping in which nobody is the Candidate, or nobody is the Interviewer, and keeps the earlier mapping", () => {
    const ids = idsByLabel(importThreeSpeakers());
    const confirmed = core.confirmSpeakerMapping(interview.id, { [ids.Ayşe!]: "interviewer", [ids.Ece!]: "candidate", [ids.Gözlemci!]: "other" });

    // No Interviewer: the questions would have nobody who asked them.
    expect(() => core.confirmSpeakerMapping(interview.id, { [ids.Ayşe!]: "other", [ids.Ece!]: "candidate", [ids.Gözlemci!]: "other" })).toThrow(
      expect.objectContaining({ name: "InvalidInputError", field: "interviewer", rule: "required" }),
    );
    // Nobody is the Candidate: nothing could be said to be the Candidate's words.
    expect(() => core.confirmSpeakerMapping(interview.id, { [ids.Ayşe!]: "interviewer", [ids.Ece!]: "interviewer", [ids.Gözlemci!]: "other" })).toThrow(
      expect.objectContaining({ name: "InvalidInputError", field: "candidate", rule: "required" }),
    );

    expect(core.getTranscript(interview.id)).toEqual(confirmed);
  });

  it("refuses a mapping with two Candidates, since an Interview is one Candidate's", () => {
    const ids = idsByLabel(importThreeSpeakers());

    expect(() => core.confirmSpeakerMapping(interview.id, { [ids.Ayşe!]: "interviewer", [ids.Ece!]: "candidate", [ids.Gözlemci!]: "candidate" })).toThrow(
      expect.objectContaining({ name: "InvalidInputError", field: "candidate", rule: "format" }),
    );
    expect(core.getTranscript(interview.id)?.speakerMappingConfirmedAt).toBeNull();
  });

  it("accepts a Transcript with one speaker as the Candidate's alone", () => {
    const transcript = core.importTranscript(interview.id, { fileName: "t.txt", bytes: new TextEncoder().encode("Ece: Ödeme servislerini yazdım.") });

    const confirmed = core.confirmSpeakerMapping(interview.id, { [transcript.speakers[0]!.id]: "candidate" });

    expect(speakersOf(confirmed)).toEqual(["Ece: candidate, verified"]);
  });

  it("refuses a role that is not Candidate, Interviewer, or Other", () => {
    const ids = idsByLabel(importThreeSpeakers());
    // Roles arrive from the browser as JSON, so core cannot trust their type.
    const roles = { [ids["Ayşe"]!]: "interviewer", [ids["Ece"]!]: "recruiter", [ids["Gözlemci"]!]: "other" };

    expect(() => core.confirmSpeakerMapping(interview.id, roles as never)).toThrow(
      expect.objectContaining({ field: "speakerMapping", rule: "format" }),
    );
    expect(core.getTranscript(interview.id)?.speakerMappingConfirmedAt).toBeNull();
  });

  it("refuses a role for a speaker that is not in the Transcript", () => {
    const ids = idsByLabel(importThreeSpeakers());
    const roles = {
      [ids["Ayşe"]!]: "interviewer",
      [ids["Ece"]!]: "candidate",
      [ids["Gözlemci"]!]: "other",
      "speaker-of-another-transcript": "candidate",
    } as const;

    expect(() => core.confirmSpeakerMapping(interview.id, roles)).toThrow(NotFoundError);
    expect(core.getTranscript(interview.id)?.speakerMappingConfirmedAt).toBeNull();
  });

  it("refuses a mapping for an Interview without a Transcript, or one that does not exist", () => {
    expect(() => core.confirmSpeakerMapping(interview.id, {})).toThrow(NotFoundError);
    expect(() => core.confirmSpeakerMapping("no-such-interview", {})).toThrow(NotFoundError);
  });

  it("starts unverified again when the Transcript is replaced", () => {
    const ids = idsByLabel(importThreeSpeakers());
    core.confirmSpeakerMapping(interview.id, {
      [ids["Ayşe"]!]: "interviewer",
      [ids["Ece"]!]: "candidate",
      [ids["Gözlemci"]!]: "other",
    });

    const replaced = importThreeSpeakers();

    expect(speakersOf(replaced)).toEqual([
      "Ayşe: no role, unverified",
      "Ece: no role, unverified",
      "Gözlemci: no role, unverified",
    ]);
    expect(replaced.speakerMappingConfirmedAt).toBeNull();
  });
});

