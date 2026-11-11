import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, type Candidate, type Core } from "./index.ts";

const today = "2026-11-10";

let dir: string;
let dbPath: string;
let core: Core;
let candidate: Candidate;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  core = openCore(dbPath, { today: () => today, timeOfDay: () => "12:00" });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Interviews", () => {
  it("lists an Interview after it is added to a Candidate", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
    expect(added.candidateId).toBe(candidate.id);
    expect(added.date).toBe("2026-11-03");
  });

  it("numbers a Candidate's Interviews by date, earliest first, then undated ones in the order added", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    const later = core.addInterview({ candidateId: candidate.id, date: "2026-11-20" });
    const undated = core.addInterview({ candidateId: candidate.id });
    const othersOnly = core.addInterview({ candidateId: other.id, date: "2026-12-01" });
    const earlier = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });

    expect(core.listInterviews(candidate.id).map((i) => [i.id, i.number])).toEqual([
      [earlier.id, 1],
      [later.id, 2],
      [undated.id, 3],
    ]);
    expect(earlier.number).toBe(1);
    expect(othersOnly.number).toBe(1);
  });

  it("gives Interviews on the same day their numbers in the order they were added", () => {
    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });

    expect([first.number, second.number]).toEqual([1, 2]);
    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([first.id, second.id]);
  });

  it("lists several Interviews of one Candidate, earliest date first and undated ones last", () => {
    const later = core.addInterview({ candidateId: candidate.id, date: "2026-11-20" });
    const undatedA = core.addInterview({ candidateId: candidate.id });
    const earlier = core.addInterview({ candidateId: candidate.id, date: "2026-10-28" });
    const undatedB = core.addInterview({ candidateId: candidate.id, date: null });

    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([
      earlier.id,
      later.id,
      undatedA.id,
      undatedB.id,
    ]);
    expect(undatedA.date).toBeNull();
  });

  it("lists only the Interviews of the Candidate asked for", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.addInterview({ candidateId: other.id, date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([mine]);
  });

  it("keeps Interviews after the database is closed and opened again", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.close();

    core = openCore(dbPath, { today: () => today });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
  });

  it("marks an Interview as planned only when its date is after today", () => {
    const tomorrow = core.addInterview({ candidateId: candidate.id, date: "2026-11-11" });
    const onToday = core.addInterview({ candidateId: candidate.id, date: today });
    const past = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const undated = core.addInterview({ candidateId: candidate.id });

    expect([tomorrow.planned, onToday.planned, past.planned, undated.planned]).toEqual([true, false, false, false]);
  });

  it("treats a blank date as no date", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "  " });

    expect(added.date).toBeNull();
  });

  it("refuses a date that is not a real YYYY-MM-DD day and saves nothing", () => {
    for (const date of ["03.11.2026", "2026-11-3", "2026-02-30", "2026-13-01", "tomorrow"]) {
      expect(() => core.addInterview({ candidateId: candidate.id, date })).toThrow(InvalidInputError);
    }

    expect(core.listInterviews(candidate.id)).toEqual([]);
  });

  it("accepts the 29th of February in a leap year", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2028-02-29" });

    expect(added.date).toBe("2028-02-29");
  });

  it("keeps the Interviews of a database made before Interviews had a time", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.close();
    // Puts the file back to the schema before the time column: four versions earlier, without it
    // and without the Saved Question mark and the Asked Question mark that came after it (the AI
    // client default after those changes no table).
    const file = new DatabaseSync(dbPath);
    const { user_version: version } = file.prepare("PRAGMA user_version").get() as { user_version: number };
    file.exec(
      `ALTER TABLE asked_question DROP COLUMN marked_wrong; ALTER TABLE saved_question DROP COLUMN mark;
       ALTER TABLE interview DROP COLUMN time; PRAGMA user_version = ${version - 4};`,
    );
    file.close();

    core = openCore(dbPath, { today: () => today });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
    expect(core.rescheduleInterview(added.id, { date: "2026-11-03", time: "10:00" }).time).toBe("10:00");
  });

  it("keeps the time of day of an Interview", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "14:30" });

    expect(added.time).toBe("14:30");
    expect(core.listInterviews(candidate.id)).toEqual([added]);
    expect(core.addInterview({ candidateId: candidate.id, date: "2026-11-04" }).time).toBeNull();
    expect(core.addInterview({ candidateId: candidate.id, date: "2026-11-05", time: " " }).time).toBeNull();
  });

  it("refuses a time that is not a real HH:MM time, or a time without a date, and saves nothing", () => {
    for (const time of ["9:30", "24:00", "12:60", "14.30", "noon", "14:30:00"]) {
      expect(() => core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time })).toThrow(InvalidInputError);
    }
    expect(() => core.addInterview({ candidateId: candidate.id, time: "14:30" })).toThrow(InvalidInputError);

    expect(core.listInterviews(candidate.id)).toEqual([]);
  });

  it("orders the Interviews of one day by time, with those without a time last in the order added", () => {
    const untimedA = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const afternoon = core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "15:00" });
    const untimedB = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const morning = core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "09:30" });
    const dayBefore = core.addInterview({ candidateId: candidate.id, date: "2026-11-02", time: "18:00" });

    expect(core.listInterviews(candidate.id).map((i) => [i.id, i.number])).toEqual([
      [dayBefore.id, 1],
      [morning.id, 2],
      [afternoon.id, 3],
      [untimedA.id, 4],
      [untimedB.id, 5],
    ]);
  });

  it("allows two Interviews at the same day and time, for one Candidate or two", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-12", time: "10:00" });
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-12", time: "10:00" });
    const others = core.addInterview({ candidateId: other.id, date: "2026-11-12", time: "10:00" });

    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([first.id, second.id]);
    expect(others.time).toBe("10:00");
  });

  it("marks an Interview today as planned only while its time is still ahead", () => {
    core.close();
    core = openCore(dbPath, { today: () => today, timeOfDay: () => "13:00" });

    const later = core.addInterview({ candidateId: candidate.id, date: today, time: "13:01" });
    const rightNow = core.addInterview({ candidateId: candidate.id, date: today, time: "13:00" });
    const earlier = core.addInterview({ candidateId: candidate.id, date: today, time: "09:00" });
    const untimed = core.addInterview({ candidateId: candidate.id, date: today });
    const tomorrowEarly = core.addInterview({ candidateId: candidate.id, date: "2026-11-11", time: "08:00" });
    const yesterdayLate = core.addInterview({ candidateId: candidate.id, date: "2026-11-09", time: "23:00" });

    expect([later, rightNow, earlier, untimed, tomorrowEarly, yesterdayLate].map((i) => i.planned)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it("changes the date and time of an Interview, and numbers follow the new order", () => {
    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "10:00" });
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });

    const moved = core.rescheduleInterview(first.id, { date: "2026-11-20", time: "16:15" });

    expect(moved).toMatchObject({ id: first.id, date: "2026-11-20", time: "16:15", number: 2, planned: true });
    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([second.id, first.id]);
    expect(core.rescheduleInterview(first.id, { date: "2026-11-20" }).time).toBeNull();
    expect(core.rescheduleInterview(first.id, {})).toMatchObject({ date: null, time: null, planned: false });
  });

  it("refuses a change to a date or time that is not real, and keeps the Interview as it was", () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03", time: "10:00" });

    expect(() => core.rescheduleInterview(interview.id, { date: "2026-02-30", time: "10:00" })).toThrow(InvalidInputError);
    expect(() => core.rescheduleInterview(interview.id, { date: "2026-11-04", time: "25:00" })).toThrow(InvalidInputError);
    expect(() => core.rescheduleInterview(interview.id, { time: "10:00" })).toThrow(InvalidInputError);
    expect(() => core.rescheduleInterview("no-such-id", { date: "2026-11-04" })).toThrow(NotFoundError);

    expect(core.listInterviews(candidate.id)).toEqual([interview]);
  });

  it("deletes an Interview; its notes and questions stay with the Candidate, untagged", () => {
    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, interviewId: first.id, text: "Tagged note" });
    const question = core.tagSavedQuestion(core.addSavedQuestion({ candidateId: candidate.id, text: "A question?" }).id, first.id);
    expect(question.interviewId).toBe(first.id);

    core.deleteInterview(first.id);

    expect(core.listInterviews(candidate.id).map((i) => [i.id, i.number])).toEqual([[second.id, 1]]);
    expect(core.listInterviewerNotes(candidate.id).map((n) => [n.id, n.interviewId])).toEqual([[note!.id, null]]);
    expect(core.listSavedQuestions(candidate.id).map((q) => [q.id, q.interviewId])).toEqual([[question.id, null]]);
    expect(() => core.deleteInterview(first.id)).toThrow(NotFoundError);
  });

  it("deletes the Transcript, AI Notes, and Asked Questions of a deleted Interview, and nothing of the others", async () => {
    const candidates = await core.loadDemoCandidates();
    const elif = candidates.find((c) => c.name === "Elif Kaya")!;
    const withTranscript = core.getCandidateOverview(elif.id).interviews.find((i) => i.transcript !== null)!;
    expect(core.listAiNotes(withTranscript.id).length).toBeGreaterThan(0);
    const others = candidates.filter((c) => c.id !== elif.id).map((c) => core.getCandidateOverview(c.id));

    core.deleteInterview(withTranscript.id);

    expect(core.getTranscript(withTranscript.id)).toBeUndefined();
    expect(() => core.listAiNotes(withTranscript.id)).toThrow(NotFoundError);
    expect(() => core.listAskedQuestions(withTranscript.id)).toThrow(NotFoundError);
    expect(core.getCandidateOverview(elif.id).interviews.map((i) => i.id)).not.toContain(withTranscript.id);
    expect(candidates.filter((c) => c.id !== elif.id).map((c) => core.getCandidateOverview(c.id))).toEqual(others);
  });

  it("deletes the Suggested Questions that quote a deleted Interview, and shows a Candidate Brief quote from it as not found", () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const transcript = core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Arka plan işlerini nasıl çalıştırdınız?\nAda: Redis ile BullMQ kullandık."),
    });
    core.confirmSpeakerMapping(
      interview.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"] as const)),
    );
    core.allowAiClientWrites(true);
    const quote = { source: "transcript" as const, interviewId: interview.id, segmentNumber: 2, quote: "BullMQ" };
    core.saveSuggestedQuestionsFromClient(candidate.id, [
      { question: "Ekibin nasıl çalışıyordu?", reason: "Genel bir başlangıç.", evidence: [] },
      { question: "BullMQ işleri neden yeniden deneniyordu?", reason: "Transcript'te geçiyor.", evidence: [quote] },
    ]);
    core.saveCandidateBriefFromClient(candidate.id, { text: "BullMQ kullandı [1].", evidence: [{ number: 1, ...quote }] });
    expect(core.listSuggestedQuestions(candidate.id)).toHaveLength(2);
    expect(core.getCandidateBrief(candidate.id)!.evidence.map((e) => e.found)).toEqual([true]);

    core.deleteInterview(interview.id);

    expect(core.listSuggestedQuestions(candidate.id).map((s) => s.text)).toEqual(["Ekibin nasıl çalışıyordu?"]);
    expect(core.getCandidateBrief(candidate.id)!.evidence.map((e) => e.found)).toEqual([false]);
  });

  describe("the default Interview of a Candidate", () => {
    const add = (date?: string, time?: string) => core.addInterview({ candidateId: candidate.id, date, time });

    it("is none when the Candidate has no Interviews", () => {
      expect(core.getDefaultInterview(candidate.id)).toBeNull();
      expect(() => core.getDefaultInterview("no-such-id")).toThrow(NotFoundError);
    });

    it("is the latest Interview that has taken place, even when others are planned or undated", () => {
      add("2026-10-01");
      const latest = add("2026-11-10", "09:00");
      add("2026-11-20");
      add();

      expect(core.getDefaultInterview(candidate.id)?.id).toBe(latest.id);
    });

    it("is the earliest planned Interview when none has taken place", () => {
      add();
      add("2026-12-01");
      const soonest = add("2026-11-15", "11:00");

      expect(core.getDefaultInterview(candidate.id)?.id).toBe(soonest.id);
    });

    it("is the first Interview without a date when there is nothing else", () => {
      const first = add();
      add();

      expect(core.getDefaultInterview(candidate.id)?.id).toBe(first.id);
    });
  });

  it("refuses to add or list Interviews for a Candidate that does not exist", () => {
    expect(() => core.addInterview({ candidateId: "no-such-id" })).toThrow(NotFoundError);
    expect(() => core.listInterviews("no-such-id")).toThrow(NotFoundError);
  });
});
