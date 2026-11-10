// The browser's only way to reach core: the local server's /api routes.
// Only types come from core; they are erased before the code reaches the browser.
import type {
  AiFailure,
  AiNote,
  AiNoteGeneration,
  Candidate,
  Cv,
  CvPage,
  EvidenceResult,
  EvidenceSearch,
  EvidenceSources,
  Highlight,
  InputRule,
  Interview,
  InterviewerNote,
  NewCandidate,
  NewInterview,
  NewInterviewerNotes,
  Precondition,
  SavedQuestion,
  SpeakerRole,
  Transcript,
  TranscriptFormat,
} from "../../core/index.ts";

export type { AiFailure, AiNote, AiNoteGeneration, Candidate, Cv, CvPage, EvidenceResult, EvidenceSearch, EvidenceSources, Highlight, Interview, InterviewerNote, SavedQuestion, SpeakerRole, Transcript, TranscriptFormat };

export class ApiError extends Error {
  readonly status: number;
  // Set when core refused the input: which field, and which rule it broke.
  readonly field: string | undefined;
  readonly rule: InputRule | undefined;
  // Set when core refused because another step must come first.
  readonly reason: Precondition | undefined;
  // Set when the AI model call failed.
  readonly failure: AiFailure | undefined;

  constructor(
    status: number,
    message: string,
    details: { field?: string; rule?: InputRule; reason?: Precondition; failure?: AiFailure } = {},
  ) {
    super(message);
    this.status = status;
    this.field = details.field;
    this.rule = details.rule;
    this.reason = details.reason;
    this.failure = details.failure;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, typeof body.error === "string" ? body.error : response.statusText, {
      field: typeof body.field === "string" ? body.field : undefined,
      rule: typeof body.rule === "string" ? (body.rule as InputRule) : undefined,
      reason: typeof body.reason === "string" ? (body.reason as Precondition) : undefined,
      failure: typeof body.failure === "string" ? (body.failure as AiFailure) : undefined,
    });
  }
  return body as T;
}

function sendForm(fields: Record<string, string | File>): RequestInit {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return { method: "POST", body: form };
}

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  listCandidates: () => request<Candidate[]>("/candidates"),
  listCandidateRoles: () => request<string[]>("/candidate-roles"),
  getCandidate: (id: string) => request<Candidate>(`/candidates/${encodeURIComponent(id)}`),
  createCandidate: (input: NewCandidate) => request<Candidate>("/candidates", sendJson("POST", input)),
  deleteCandidate: (id: string) => request<void>(`/candidates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createCandidateWithCv: (input: NewCandidate, cv: File) =>
    request<Candidate>("/candidates", sendForm({ ...input, cv })),
  guessCandidateName: (cv: File) => request<{ name: string }>("/cv-name-guess", sendForm({ cv })),
  getCv: (candidateId: string) => request<Cv | null>(`/candidates/${encodeURIComponent(candidateId)}/cv`),
  cvFileUrl: (candidateId: string) => `/api/candidates/${encodeURIComponent(candidateId)}/cv/file`,
  uploadCv: (candidateId: string, cv: File) =>
    request<Cv>(`/candidates/${encodeURIComponent(candidateId)}/cv`, sendForm({ cv })),
  searchEvidence: (candidateId: string, query: string, sources: EvidenceSources, candidateOnly: boolean) =>
    request<EvidenceSearch>(
      `/candidates/${encodeURIComponent(candidateId)}/evidence?${new URLSearchParams({
        q: query,
        sources,
        candidateOnly: String(candidateOnly),
      })}`,
    ),
  listTranscriptFormats: () => request<TranscriptFormat[]>("/transcript-formats"),
  getTranscript: (interviewId: string) =>
    request<Transcript | null>(`/interviews/${encodeURIComponent(interviewId)}/transcript`),
  importTranscript: (interviewId: string, transcript: File) =>
    request<Transcript>(`/interviews/${encodeURIComponent(interviewId)}/transcript`, sendForm({ transcript })),
  confirmSpeakerMapping: (interviewId: string, roles: Record<string, SpeakerRole>) =>
    request<Transcript>(`/interviews/${encodeURIComponent(interviewId)}/speaker-mapping`, sendJson("PUT", { roles })),
  getApiKeyStatus: () => request<{ saved: boolean }>("/ai/api-key"),
  saveApiKey: (apiKey: string) => request<{ saved: boolean }>("/ai/api-key", sendJson("PUT", { apiKey })),
  removeApiKey: () => request<void>("/ai/api-key", { method: "DELETE" }),
  listAiNotes: (interviewId: string) => request<AiNote[]>(`/interviews/${encodeURIComponent(interviewId)}/ai-notes`),
  generateAiNotes: (interviewId: string) =>
    request<AiNoteGeneration>(`/interviews/${encodeURIComponent(interviewId)}/ai-notes`, { method: "POST" }),
  getInterfaceLanguage: () => request<{ language: string }>("/interface-language"),
  setInterfaceLanguage: (language: string) =>
    request<{ language: string }>("/interface-language", sendJson("PUT", { language })),
  listInterviews: (candidateId: string) =>
    request<Interview[]>(`/candidates/${encodeURIComponent(candidateId)}/interviews`),
  addInterview: ({ candidateId, ...fields }: NewInterview) =>
    request<Interview>(`/candidates/${encodeURIComponent(candidateId)}/interviews`, sendJson("POST", fields)),
  listInterviewerNotes: (candidateId: string, interviewId: string | null) =>
    request<InterviewerNote[]>(
      `/candidates/${encodeURIComponent(candidateId)}/notes` +
        (interviewId ? `?interviewId=${encodeURIComponent(interviewId)}` : ""),
    ),
  addInterviewerNotes: ({ candidateId, ...fields }: NewInterviewerNotes) =>
    request<InterviewerNote[]>(`/candidates/${encodeURIComponent(candidateId)}/notes`, sendJson("POST", fields)),
  editInterviewerNote: (id: string, text: string) =>
    request<InterviewerNote>(`/notes/${encodeURIComponent(id)}/text`, sendJson("PUT", { text })),
  tagInterviewerNote: (id: string, interviewId: string | null) =>
    request<InterviewerNote>(`/notes/${encodeURIComponent(id)}/interview`, sendJson("PUT", { interviewId })),
  deleteInterviewerNote: (id: string) => request<void>(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listSavedQuestions: (candidateId: string) =>
    request<SavedQuestion[]>(`/candidates/${encodeURIComponent(candidateId)}/saved-questions`),
  addSavedQuestion: (candidateId: string, text: string) =>
    request<SavedQuestion>(`/candidates/${encodeURIComponent(candidateId)}/saved-questions`, sendJson("POST", { text })),
  editSavedQuestion: (id: string, text: string) =>
    request<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}`, sendJson("PUT", { text })),
  deleteSavedQuestion: (id: string) => request<void>(`/saved-questions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  moveSavedQuestion: (id: string, position: number) =>
    request<void>(`/saved-questions/${encodeURIComponent(id)}/position`, sendJson("PUT", { position })),
};
