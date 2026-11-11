import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { deleteCandidateIfExists, getCandidate, hasAnyCandidate, insertCandidate, type Candidate } from "./candidates.ts";
import { acceptCv, deleteCandidateAndCv, storeCv, storedFileName, type AcceptedCv } from "./cv.ts";
import { inTransaction } from "./database.ts";
import { addInterviewerNotes, type Now } from "./interviewer-notes.ts";
import { addInterview, listInterviews, type Today } from "./interviews.ts";
import { confirmAiNote, correctAiNote, dismissAiNote, listAiNotes, saveCheckedAiNotes } from "./ai-notes.ts";
import { listAskedQuestions, markAskedQuestionWrong, saveCheckedAskedQuestions, setSavedQuestionAsked } from "./asked-questions.ts";
import { elifKaya, mertAydin, selinOzturk, type DemoAiContent } from "./demo-ai-content.ts";
import { addRoleQuestion, listRoleQuestions } from "./role-questions.ts";
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

// Loads the demo set for `npm run demo`: the demo Candidate and ten more fictional Candidates, a
// small hiring process that shows what the app does without any work (decision 375). Like the
// demo Candidate, each has a fixed id, so loading again replaces the set with a fresh copy and
// other Candidates are not touched. The first start of the app still loads only the demo Candidate.
export async function loadDemoCandidates(db: DatabaseSync, folder: string, today: Today, now: Now): Promise<Candidate[]> {
  // Before any Candidate, so the demo Candidates of the role get them as a new Candidate would.
  inTransaction(db, () => addDemoRoleQuestions(db));
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

// The Role Questions of the demo Candidate's role, which most of the set has. Only the ones the
// role does not have yet are added, so loading again neither repeats them nor touches the
// Interviewer's own questions or order (decision 376).
const demoRoleQuestions = {
  role: "Kıdemli Backend Mühendisi",
  questions: [
    "Yeni bir servis tasarlarken ilk hangi soruları sorarsın?",
    "Canlıda bir hatanın kaynağını nasıl ararsın, önce nelere bakarsın?",
    "Bir veritabanı şemasını kesinti olmadan nasıl değiştirirsin?",
  ],
};

function addDemoRoleQuestions(db: DatabaseSync): void {
  const existing = new Set(listRoleQuestions(db, demoRoleQuestions.role).questions.map((q) => q.text));
  for (const text of demoRoleQuestions.questions) {
    if (!existing.has(text)) addRoleQuestion(db, { role: demoRoleQuestions.role, text });
  }
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
  const first = addInterview(db, today, { candidateId: id, date: shiftDays(today().day, -7), time: "11:00" });
  const second = addInterview(db, today, { candidateId: id, date: shiftDays(today().day, 3), time: "14:00" });

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
// negative for an Interview that has taken place, 0 for today, positive for a Planned one, null
// for one without a date. Three Candidates have a Planned Interview on the same day, two at the
// same time, so the calendar shows a busy day. Candidates of the demo Candidate's role also get
// its Role Questions, first in their list.
interface DemoSetCandidate {
  id: string;
  name: string;
  role: string;
  cv?: { file: string; fileName: string };
  interviews: {
    days: number | null;
    time?: string;
    transcript?: { file: string; roles?: Record<string, SpeakerRole> };
    notes?: string[];
    // Ready-made Asked Questions and AI Notes; the Transcript's roles must be given.
    ai?: DemoAiContent;
  }[];
  notes?: string[];
  questions: string[];
  // Saved Questions the Interviewer marked as asked by hand, against what the Transcripts say.
  markedAsked?: string[];
  // Saved Questions written after the questions asked were found, for the next Planned Interview.
  nextQuestions?: string[];
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
        time: "10:30",
        transcript: { file: "transcript-elif-kaya.vtt", roles: { Ayşe: "interviewer", Elif: "candidate" } },
        notes: ["Profiler ile performans sorununu bulma adımlarını iyi sıraladı", "Mobil görünümü nasıl test ettiklerini sormayı unuttum"],
        ai: elifKaya,
      },
      { days: 6, time: "10:00", notes: ["Canlı kodlama: küçük bir form bileşeni"] },
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
        time: "15:00",
        transcript: { file: "transcript-mert-aydin.txt", roles: { Ayşe: "interviewer", Mert: "candidate" } },
        notes: ["Flink kontrol noktası süresini neden beş dakika seçtiklerini sor"],
        ai: mertAydin,
      },
      { days: 1, time: "14:00" },
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
      { days: -20, time: "09:30", notes: ["Ön görüşme: maaş beklentisi ve başlama tarihi konuşuldu"] },
      {
        days: -4,
        time: "13:00",
        transcript: { file: "transcript-selin-ozturk.txt", roles: { Ayşe: "interviewer", Selin: "candidate" } },
        notes: [
          "Kesinti sonrası alınan önlemleri somut anlattı",
          "Kayıt bittikten sonra Terraform durum dosyasını sordum: S3'te tutuyorlar, kilit için DynamoDB kullanıyorlar",
        ],
        ai: selinOzturk,
      },
      { days: 6, time: "10:00", notes: ["Teknik müdür de katılacak, sistem tasarımı ağırlıklı"] },
    ],
    // The Workspace that shows everything: AI Notes in every Review State, an Answer Summary marked
    // wrong, and Saved Questions asked, not found, planned, and decided by hand (decision 375).
    questions: [
      "Kademeli dağıtımda geri dönüş kararını kim veriyor?",
      "Kesintiyi ilk kim fark etti?",
      "Felaket kurtarma planınızı en son ne zaman denediniz?",
      "Terraform durum dosyasını nerede tutuyorsunuz?",
    ],
    markedAsked: ["Terraform durum dosyasını nerede tutuyorsunuz?"],
    nextQuestions: ["Vault erişimini servis bazında nasıl sınırlıyorsunuz?", "Felaket kurtarma tatbikatını kim planlıyor?"],
  },
  {
    id: "demo-candidate-burak",
    name: "Burak Çelik",
    role: "Mobil Geliştirici",
    interviews: [{ days: 6, time: "15:30" }, { days: null }],
    notes: ["CV henüz gelmedi, işe alım ekibinden iste"],
    questions: ["Hem iOS hem Android için aynı kodu kullandınız mı?"],
  },
  {
    id: "demo-candidate-can",
    name: "Can Arslan",
    role: "Kıdemli Backend Mühendisi",
    cv: { file: "cv-can-arslan.pdf", fileName: "Can_Arslan_CV.pdf" },
    // Today, so the Candidate list and the calendar always have an Interview today.
    interviews: [{ days: 0, time: "16:30", notes: ["RabbitMQ kuyruğunda tekrar denemenin nasıl çalıştığını sor"] }],
    questions: [
      "Hasar bildirimi kuyruğunda bir mesaj işlenemezse ne oluyor?",
      "Sorgu süresini yarıya indirirken hangi indeksleri eklediniz?",
    ],
  },
  {
    id: "demo-candidate-kerem",
    name: "Kerem Doğan",
    role: "Kıdemli Backend Mühendisi",
    interviews: [
      {
        days: -2,
        time: "11:00",
        notes: ["Monolitten servislere geçişi somut örneklerle anlattı", "Transkripti toplantı aracından indirip ekle"],
      },
    ],
    notes: ["CV'yi işe alım ekibinden iste"],
    questions: ["Monolitten ayırdığınız ilk servis hangisiydi, neden onu seçtiniz?"],
  },
  {
    id: "demo-candidate-zeynep",
    name: "Zeynep Şahin",
    role: "Kıdemli Backend Mühendisi",
    cv: { file: "cv-zeynep-sahin.pdf", fileName: "Zeynep_Sahin_CV.pdf" },
    interviews: [],
    notes: ["İşe alım ekibi gelecek hafta için uygun saatleri soracak"],
    questions: ["Üç kişilik ekibin teknik liderliğinde verdiğin en zor karar neydi?"],
  },
  {
    id: "demo-candidate-emre",
    name: "Emre Koç",
    role: "Kıdemli Backend Mühendisi",
    interviews: [],
    questions: [],
  },
  {
    id: "demo-candidate-ece",
    name: "Ece Yıldız",
    role: "Frontend Geliştirici",
    cv: { file: "cv-ece-yildiz.pdf", fileName: "Ece_Yildiz_CV.pdf" },
    interviews: [{ days: 2, time: "11:00" }],
    questions: ["Vue'dan React'e geçmeye neden karar verdiniz?", "Kod bölmeyi hangi sayfalarda uyguladınız?"],
  },
  {
    id: "demo-candidate-berk",
    name: "Berk Aksoy",
    role: "Frontend Geliştirici",
    interviews: [],
    notes: ["Referansla geldi, CV'sini e-postayla iste"],
    questions: [],
  },
];

function addSetCandidate(db: DatabaseSync, today: Today, now: Now, demo: DemoSetCandidate): Candidate {
  const candidate = insertCandidate(db, demo.id, { name: demo.name, role: demo.role });
  // Saved Questions come first, so the ready-made Asked Questions can be linked to them.
  for (const text of demo.questions) addSavedQuestion(db, { candidateId: candidate.id, text });
  for (const plan of demo.interviews) {
    const date = plan.days === null ? undefined : shiftDays(today().day, plan.days);
    const interview = addInterview(db, today, { candidateId: candidate.id, date, time: plan.time });
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
  const savedIds = new Map(listSavedQuestions(db, candidate.id).map((question) => [question.text, question.id]));
  for (const text of demo.markedAsked ?? []) setSavedQuestionAsked(db, today, savedIds.get(text)!, true);
  if (demo.nextQuestions) {
    const next = listInterviews(db, today, candidate.id).find((interview) => interview.planned);
    for (const text of demo.nextQuestions) addSavedQuestion(db, { candidateId: candidate.id, interviewId: next?.id, text });
  }
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
  const notes = saveCheckedAiNotes(db, now, interviewId, content.aiNotes.map(({ statement, evidence }) => ({ statement, evidence })), "app");
  if (asked.dropped > 0 || notes.dropped > 0) {
    throw new Error(`Demo AI content has quotes that are not in its Transcript: ${asked.dropped + notes.dropped}.`);
  }
  reviewDemoAiContent(db, interviewId, content);
}

// Does what the Interviewer did after the AI output was saved, through the same operations.
function reviewDemoAiContent(db: DatabaseSync, interviewId: string, content: DemoAiContent): void {
  const askedIds = new Map(listAskedQuestions(db, interviewId)!.askedQuestions.map((asked) => [asked.question, asked.id]));
  for (const asked of content.askedQuestions) {
    if (asked.markedWrong) markAskedQuestionWrong(db, askedIds.get(asked.question)!, true);
  }
  const noteIds = new Map(listAiNotes(db, interviewId).map((note) => [note.statement, note.id]));
  for (const { statement, review } of content.aiNotes) {
    const id = noteIds.get(statement)!;
    if (review === "confirmed") confirmAiNote(db, id);
    else if (review === "dismissed") dismissAiNote(db, id);
    else if (review) correctAiNote(db, id, review.correction);
  }
}
