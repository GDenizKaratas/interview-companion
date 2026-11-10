import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { deleteCandidateIfExists, hasAnyCandidate, insertCandidate, type Candidate } from "./candidates.ts";
import { acceptCv, storeCv, storedFileName, type AcceptedCv } from "./cv.ts";
import { inTransaction } from "./database.ts";
import { addInterviewerNotes, type Now } from "./interviewer-notes.ts";
import { addInterview, type Today } from "./interviews.ts";
import { addSavedQuestion } from "./saved-questions.ts";
import { deleteSetting, setSetting } from "./settings.ts";

// The fixed id of the demo Candidate. It lets a second load find the first one.
const demoCandidateId = "demo-candidate";

// Loads a fictional Candidate, in Turkish, so a new Interviewer can explore the app.
// Loading again replaces the demo Candidate with a fresh copy, so there is never more than one,
// and a newer version of the app brings its newer demo data. Other Candidates are not touched.
export async function loadDemoCandidate(db: DatabaseSync, folder: string, today: Today, now: Now): Promise<Candidate> {
  const cv = await readDemoCv();
  return loadDemo(db, folder, today, now, cv);
}

// The demo Candidate's fictional CV, made by demo/make-cv.ts. It is read before any change,
// because reading a PDF cannot happen inside a database transaction.
async function readDemoCv(): Promise<AcceptedCv> {
  const bytes = new Uint8Array(readFileSync(new URL("../../demo/cv.pdf", import.meta.url)));
  return acceptCv({ fileName: "Deniz_Yilmaz_CV.pdf", bytes });
}

function loadDemo(db: DatabaseSync, folder: string, today: Today, now: Now, cv: AcceptedCv): Candidate {
  const earlierCvFile = storedFileName(db, demoCandidateId);
  return storeCv(
    db,
    folder,
    now,
    cv,
    () => {
      // Once the demo has been loaded, the first start no longer needs to load it.
      deleteSetting(db, demoPendingSetting);
      deleteCandidateIfExists(db, demoCandidateId);
      return addDemoContent(db, today, now);
    },
    earlierCvFile === undefined ? [] : [earlierCvFile],
  );
}

// Set when the database file is created, and removed once the demo Candidate is loaded or the
// first start has passed. Databases created before this setting existed never have it.
const demoPendingSetting = "demo_candidate_pending";

// Called by core when it has just created the database file.
export function markDemoPending(db: DatabaseSync): void {
  setSetting(db, demoPendingSetting, "yes");
}

// Loads the demo Candidate on the first start of a new database with no Candidates, so a new
// Interviewer sees something to explore. It happens only once: a demo Candidate the Interviewer
// deleted does not come back, and neither does one for an Interviewer who deletes all of their
// own Candidates later. Returns the demo Candidate, or undefined when nothing was loaded.
export async function loadDemoCandidateOnFirstStart(
  db: DatabaseSync,
  folder: string,
  today: Today,
  now: Now,
): Promise<Candidate | undefined> {
  const cv = await readDemoCv();
  return inTransaction(db, () => {
    if (!deleteSetting(db, demoPendingSetting) || hasAnyCandidate(db)) return undefined;
    return loadDemo(db, folder, today, now, cv);
  });
}

function addDemoContent(db: DatabaseSync, today: Today, now: Now): Candidate {
  const candidate = insertCandidate(db, demoCandidateId, {
    name: "Deniz Yılmaz",
    role: "Kıdemli Backend Mühendisi",
  });
  const id = candidate.id;
  const first = addInterview(db, today, { candidateId: id, date: shiftDays(today(), -7) });
  const second = addInterview(db, today, { candidateId: id, date: shiftDays(today(), 3) });

  addInterviewerNotes(db, daysBefore(now, 7), {
    candidateId: id,
    interviewId: first.id,
    text: [
      "Ödeme işini nasıl idempotent yaptığını sor",
      "Redis ve BullMQ örneği ilginçti, ayrıntısına girmedik",
      "Kod incelemesini takımda nasıl yürüttüklerini net anlattı",
    ].join("\n"),
  });
  addInterviewerNotes(db, daysBefore(now, 1), {
    candidateId: id,
    interviewId: second.id,
    text: "Sistem tasarımı sorusuna en az yarım saat ayır",
  });
  addInterviewerNotes(db, daysBefore(now, 2), { candidateId: id, text: "Son projenin ölçeğini kontrol et" });

  for (const text of [
    "Ödeme işini nasıl idempotent yaptın?",
    "Bir BullMQ işi üç kez başarısız olursa ne oluyor?",
    "Yük arttığında ilk darboğazı nerede gördün?",
  ]) {
    addSavedQuestion(db, { candidateId: id, text });
  }
  return candidate;
}

// Each save gets its own time, on the day it would have been written, so the notes always
// list in the same order; saves in the same millisecond would mix their lines.
function daysBefore(now: Now, days: number): Now {
  return () => new Date(now().getTime() - days * 24 * 60 * 60 * 1000);
}

// A calendar day (YYYY-MM-DD) moved by a number of days, so the demo always has one
// Interview that has taken place and one that is Planned.
function shiftDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
