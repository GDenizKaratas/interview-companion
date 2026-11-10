// The browser's only way to reach core: the local server's /api routes.
// Only types come from core; they are erased before the code reaches the browser.
import type { Candidate, Interview, NewCandidate, NewInterview } from "../../core/index.ts";

export type { Candidate, Interview };

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, typeof body.error === "string" ? body.error : response.statusText);
  }
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  listCandidates: () => request<Candidate[]>("/candidates"),
  listCandidateRoles: () => request<string[]>("/candidate-roles"),
  getCandidate: (id: string) => request<Candidate>(`/candidates/${encodeURIComponent(id)}`),
  createCandidate: (input: NewCandidate) => post<Candidate>("/candidates", input),
  listInterviews: (candidateId: string) =>
    request<Interview[]>(`/candidates/${encodeURIComponent(candidateId)}/interviews`),
  listInterviewStages: () => request<string[]>("/interview-stages"),
  addInterview: ({ candidateId, ...fields }: NewInterview) =>
    post<Interview>(`/candidates/${encodeURIComponent(candidateId)}/interviews`, fields),
};
