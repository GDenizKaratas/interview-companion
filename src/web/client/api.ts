// The browser's only way to reach core: the local server's /api routes.
// Only types come from core; they are erased before the code reaches the browser.
import type {
  Candidate,
  InputRule,
  Interview,
  InterviewerNote,
  NewCandidate,
  NewInterview,
  NewInterviewerNotes,
} from "../../core/index.ts";

export type { Candidate, Interview, InterviewerNote };

export class ApiError extends Error {
  readonly status: number;
  // Set when core refused the input: which field, and which rule it broke.
  readonly field: string | undefined;
  readonly rule: InputRule | undefined;

  constructor(status: number, message: string, field?: string, rule?: InputRule) {
    super(message);
    this.status = status;
    this.field = field;
    this.rule = rule;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof body.error === "string" ? body.error : response.statusText,
      typeof body.field === "string" ? body.field : undefined,
      typeof body.rule === "string" ? (body.rule as InputRule) : undefined,
    );
  }
  return body as T;
}

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  listCandidates: () => request<Candidate[]>("/candidates"),
  listCandidateRoles: () => request<string[]>("/candidate-roles"),
  getCandidate: (id: string) => request<Candidate>(`/candidates/${encodeURIComponent(id)}`),
  createCandidate: (input: NewCandidate) => request<Candidate>("/candidates", sendJson("POST", input)),
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
};
