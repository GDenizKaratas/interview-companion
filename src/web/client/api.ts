// The browser's only way to reach core: the local server's /api routes.
export interface Candidate {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof body.error === "string" ? body.error : response.statusText);
  }
  return body as T;
}

export const api = {
  listCandidates: () => request<Candidate[]>("/candidates"),
  getCandidate: (id: string) => request<Candidate>(`/candidates/${encodeURIComponent(id)}`),
  createCandidate: (input: { name: string; role: string }) =>
    request<Candidate>("/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
