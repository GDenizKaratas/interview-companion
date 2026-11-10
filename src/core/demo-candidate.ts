import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { deleteCandidateIfExists, getCandidate, hasAnyCandidate, insertCandidate, type Candidate } from "./candidates.ts";
import { acceptCv, deleteCandidateAndCv, storeCv, storedFileName, type AcceptedCv } from "./cv.ts";
import { inTransaction } from "./database.ts";
import { addInterviewerNotes, type Now } from "./interviewer-notes.ts";
import { addInterview, type Today } from "./interviews.ts";
import { saveCheckedAiNotes } from "./ai-notes.ts";
import { saveCheckedAskedQuestions } from "./asked-questions.ts";
import { elifKaya, mertAydin, selinOzturk, type DemoAiContent } from "./demo-ai-content.ts";
import { addSavedQuestion, listSavedQuestions } from "./saved-questions.ts";
import { deleteSetting, setSetting } from "./settings.ts";
import { confirmSpeakerMapping, importTranscript, type SpeakerRole } from "./transcripts.ts";

// The fixed id of the demo Candidate. It lets a second load find the first one.
const demoCandidateId = "demo-candidate";

// Loads a fictional Candidate, in Turkish, so a new Interviewer can explore the app.
// Loading again replaces the demo Candidate with a fresh copy, so there is never more than one,
// and a newer version of the app brings its newer demo data. Other Candidates are not touched.
export async function loadDemoCandidate(db: DatabaseSync, folder: string, today: Today, now: Now): Promise<Candidate> {
  const cv = await readDemoCv();
  return loadDemo(db, folder, today, now, cv);
}

// Loads the demo set for `npm run demo`: the demo Candidate and four more fictional Candidates,
// with past, Planned, and undated Interviews, so the Candidate list and the calendar have
// something to show. Like the demo Candidate, each has a fixed id, so loading again replaces
// the set with a fresh copy and other Candidates are not touched. The first start of the app
// still loads only the demo Candidate.
export async function loadDemoCandidates(db: DatabaseSync, folder: string, today: Today, now: Now): Promise<Candidate[]> {
  const loaded = [await loadDemoCandidate(db, folder, today, now)];
  for (const demo of demoSet) {
    const cv = demo.cv === undefined ? undefined : await readDemoFile(demo.cv.file, demo.cv.fileName);
    const add = () => {
      deleteCandidateIfExists(db, demo.id);
      return addSetCandidate(db, today, now, demo);
    };
    if (cv) {
      const earlierCvFile = storedFileName(db, demo.id);
      loaded.push(storeCv(db, folder, now, cv, add, earlierCvFile === undefined ? [] : [earlierCvFile]));
    } else {
      // The earlier copy may have been given a CV while exploring; its file goes with it.
      if (getCandidate(db, demo.id)) deleteCandidateAndCv(db, folder, demo.id);
      loaded.push(inTransaction(db, add));
    }
  }
  return loaded;
}

// The demo Candidate's fictional CV, made by demo/make-cv.ts. It is read before any change,
// because reading a PDF cannot happen inside a database transaction.
async function readDemoCv(): Promise<AcceptedCv> {
  return readDemoFile("cv.pdf", "Deniz_Yilmaz_CV.pdf");
}

async function readDemoFile(file: string, fileName: string): Promise<AcceptedCv> {
  return acceptCv({ fileName, bytes: demoBytes(file) });
}

function demoBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../demo/${file}`, import.meta.url)));
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

  // A plain-text file, imported the way the Interviewer would import one, so it can also be
  // used to try the import by hand.
  const transcriptFileName = "transcript-first-interview.txt";
  importTranscript(db, daysBefore(now, 7), first.id, {
    fileName: transcriptFileName,
    bytes: demoBytes(transcriptFileName),
  });

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

// One more Candidate of the demo set. Days are counted from the day the set is loaded:
// negative for an Interview that has taken place, positive for a Planned one, null for none.
interface DemoSetCandidate {
  id: string;
  name: string;
  role: string;
  cv?: { file: string; fileName: string };
  interviews: {
    days: number | null;
    transcript?: { file: string; roles?: Record<string, SpeakerRole> };
    notes?: string[];
    // Ready-made Asked Questions and AI Notes; the Transcript's roles must be given.
    ai?: DemoAiContent;
  }[];
  notes?: string[];
  questions: string[];
}

const demoSet: DemoSetCandidate[] = [
  {
    id: "demo-candidate-elif",
    name: "Elif Kaya",
    role: "Frontend Geliştirici",
    cv: { file: "cv-elif-kaya.pdf", fileName: "Elif_Kaya_CV.pdf" },
    interviews: [
      {
        days: -12,
        transcript: { file: "transcript-elif-kaya.vtt", roles: { Ayşe: "interviewer", Elif: "candidate" } },
        notes: ["Profiler ile performans sorununu bulma adımlarını iyi sıraladı", "Erişilebilirlik testini kimin yaptığını sor"],
        ai: elifKaya,
      },
      { days: 6, notes: ["Canlı kodlama: küçük bir form bileşeni"] },
    ],
    questions: [
      "Sanal listeyi neden seçtiniz, başka ne denediniz?",
      "Redux'tan çıkış nasıl planlandı?",
      "Mobil görünümü nasıl test ediyorsunuz?",
    ],
  },
  {
    id: "demo-candidate-mert",
    name: "Mert Aydın",
    role: "Veri Mühendisi",
    cv: { file: "cv-mert-aydin.pdf", fileName: "Mert_Aydin_CV.pdf" },
    interviews: [
      {
        days: -6,
        transcript: { file: "transcript-mert-aydin.txt", roles: { Ayşe: "interviewer", Mert: "candidate" } },
        notes: ["Flink kontrol noktası süresini neden beş dakika seçtiklerini sor"],
        ai: mertAydin,
      },
      { days: 1 },
    ],
    notes: ["CV'deki Kafka akışının ölçeğini sor"],
    questions: [
      "Saatte on milyon olayı işlerken veri kaybını nasıl önlediniz?",
      "Airflow işleri başarısız olunca ne oluyor?",
      "Flink kontrol noktası süresini neden beş dakika seçtiniz?",
    ],
  },
  {
    id: "demo-candidate-selin",
    name: "Selin Öztürk",
    role: "DevOps Mühendisi",
    cv: { file: "cv-selin-ozturk.pdf", fileName: "Selin_Ozturk_CV.pdf" },
    interviews: [
      { days: -20, notes: ["Ön görüşme: maaş beklentisi ve başlama tarihi konuşuldu"] },
      {
        days: -4,
        transcript: { file: "transcript-selin-ozturk.txt", roles: { Ayşe: "interviewer", Selin: "candidate" } },
        notes: ["Kesinti sonrası alınan önlemleri somut anlattı"],
        ai: selinOzturk,
      },
      { days: 14 },
    ],
    questions: [
      "Kademeli dağıtımda geri dönüş kararını kim veriyor?",
      "Kesintiyi ilk kim fark etti?",
      "Felaket kurtarma planınızı en son ne zaman denediniz?",
    ],
  },
  {
    id: "demo-candidate-burak",
    name: "Burak Çelik",
    role: "Mobil Geliştirici",
    interviews: [{ days: 9 }, { days: null }],
    notes: ["CV henüz gelmedi, işe alım ekibinden iste"],
    questions: ["Hem iOS hem Android için aynı kodu kullandınız mı?"],
  },
];

function addSetCandidate(db: DatabaseSync, today: Today, now: Now, demo: DemoSetCandidate): Candidate {
  const candidate = insertCandidate(db, demo.id, { name: demo.name, role: demo.role });
  // Saved Questions come first, so the ready-made Asked Questions can be linked to them.
  for (const text of demo.questions) addSavedQuestion(db, { candidateId: candidate.id, text });
  for (const plan of demo.interviews) {
    const date = plan.days === null ? undefined : shiftDays(today(), plan.days);
    const interview = addInterview(db, today, { candidateId: candidate.id, date });
    // Notes and the Transcript are dated the day of the Interview, or today for a Planned one.
    const written = daysBefore(now, Math.max(0, -(plan.days ?? 0)));
    if (plan.transcript) {
      const transcript = importTranscript(db, written, interview.id, {
        fileName: plan.transcript.file,
        bytes: demoBytes(plan.transcript.file),
      });
      const roles = plan.transcript.roles;
      if (roles) {
        confirmSpeakerMapping(
          db,
          written,
          interview.id,
          Object.fromEntries(transcript.speakers.map((speaker) => [speaker.id, roles[speaker.label]!])),
        );
      }
    }
    if (plan.ai) saveDemoAiContent(db, written, candidate.id, interview.id, plan.ai);
    if (plan.notes) {
      addInterviewerNotes(db, written, { candidateId: candidate.id, interviewId: interview.id, text: plan.notes.join("\n") });
    }
  }
  if (demo.notes) addInterviewerNotes(db, now, { candidateId: candidate.id, text: demo.notes.join("\n") });
  return candidate;
}

// Saves the ready-made AI output through the same checks as the model's. Hand-written content
// that fails a check is a mistake in the demo, so loading stops instead of hiding it.
function saveDemoAiContent(db: DatabaseSync, now: Now, candidateId: string, interviewId: string, content: DemoAiContent): void {
  const savedIds = new Map(listSavedQuestions(db, candidateId).map((question) => [question.text, question.id]));
  const askedQuestions = content.askedQuestions.map(({ savedQuestion, ...asked }) => {
    const savedQuestionId = savedQuestion === undefined ? null : savedIds.get(savedQuestion);
    if (savedQuestionId === undefined) throw new Error(`Demo Saved Question not found: ${savedQuestion}`);
    return { ...asked, savedQuestionId };
  });
  const asked = saveCheckedAskedQuestions(db, now, interviewId, askedQuestions, "app");
  const notes = saveCheckedAiNotes(db, now, interviewId, content.aiNotes, "app");
  if (asked.dropped > 0 || notes.dropped > 0) {
    throw new Error(`Demo AI content has quotes that are not in its Transcript: ${asked.dropped + notes.dropped}.`);
  }
}
