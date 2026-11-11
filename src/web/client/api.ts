// The browser's only way to reach core: the local server's /api routes.
// Only types come from core; they are erased before the code reaches the browser.
import type {
  AiFailure,
  AiNote,
  AiNoteGeneration,
  AskedQuestion,
  AskedQuestionGeneration,
  AskedQuestions,
  BriefEvidence,
  Candidate,
  CandidateBrief,
  CandidateCvCheck,
  CandidateImport,
  CandidateOrder,
  CandidateOverview,
  ExistingCandidate,
  ImportProblem,
  Cv,
  CvPage,
  DatedInterview,
  EvidenceResult,
  EvidenceSearch,
  EvidenceSources,
  Highlight,
  InputRule,
  Interview,
  InterviewAiStep,
  InterviewerNote,
  InterviewPlan,
  InterviewPlanRequest,
  InterviewPlanSettings,
  NewCandidate,
  NewInterview,
  NewInterviewerNotes,
  PlannedSlot,
  Precondition,
  QuestionMark,
  RoleInUse,
  RoleQuestion,
  RoleQuestionList,
  SavedQuestion,
  SavedQuestionCheck,
  SavedQuestionState,
  SlotRefusal,
  SpeakerRole,
  SuggestedQuestion,
  SuggestedQuestionGeneration,
  SuggestionEvidence,
  Transcript,
  TranscriptFormat,
} from "../../core/index.ts";

export type { AiFailure, AiNote, InputRule, AiNoteGeneration, AskedQuestion, AskedQuestionGeneration, AskedQuestions, BriefEvidence, Candidate, CandidateBrief, CandidateCvCheck, CandidateImport, CandidateOrder, CandidateOverview, ExistingCandidate, ImportProblem, Cv, CvPage, DatedInterview, EvidenceResult, EvidenceSearch, EvidenceSources, Highlight, Interview, InterviewAiStep, InterviewerNote, InterviewPlan, InterviewPlanRequest, InterviewPlanSettings, PlannedSlot, QuestionMark, RoleInUse, RoleQuestion, RoleQuestionList, SavedQuestion, SavedQuestionCheck, SavedQuestionState, SlotRefusal, SpeakerRole, SuggestedQuestion, SuggestedQuestionGeneration, SuggestionEvidence, Transcript, TranscriptFormat };

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
  // With an order, core orders the whole list by that column.
  listCandidateOverviews: (order?: CandidateOrder) =>
    request<CandidateOverview[]>(`/candidate-overviews${order ? `?by=${order.by}${order.reversed ? "&reversed=true" : ""}` : ""}`),
  getCandidateOverview: (id: string) => request<CandidateOverview>(`/candidates/${encodeURIComponent(id)}/overview`),
  listDatedInterviews: () => request<DatedInterview[]>("/dated-interviews"),
  getMcpSetup: () => request<{ command: string | null; desktopConfig: string | null }>("/mcp-setup"),
  listCandidateRoles: () => request<string[]>("/candidate-roles"),
  listRolesInUse: () => request<RoleInUse[]>("/roles-in-use"),
  findRoleInUse: (role: string, signal?: AbortSignal) =>
    request<{ role: string | null }>(`/role-in-use?role=${encodeURIComponent(role)}`, { signal }),
  getCandidate: (id: string) => request<Candidate>(`/candidates/${encodeURIComponent(id)}`),
  createCandidate: (input: NewCandidate) => request<Candidate>("/candidates", sendJson("POST", input)),
  deleteCandidate: (id: string) => request<void>(`/candidates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createCandidateWithCv: (input: NewCandidate, cv: File, options: { onlyIfNew?: boolean } = {}) =>
    request<Candidate>("/candidates", sendForm(options.onlyIfNew ? { ...input, cv, onlyIfNew: "true" } : { ...input, cv })),
  // name is left out to have core read it from the CV.
  checkCandidateCv: (role: string, cv: File, name?: string, signal?: AbortSignal) =>
    request<CandidateCvCheck>("/candidate-cv-checks", {
      ...sendForm(name === undefined ? { role, cv } : { role, cv, name }),
      signal,
    }),
  candidateExportUrl: (candidateId: string) => `/api/candidates/${encodeURIComponent(candidateId)}/export`,
  importCandidate: (file: File, ifExists?: ExistingCandidate) =>
    request<CandidateImport>("/candidate-imports", sendForm(ifExists ? { file, ifExists } : { file })),
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
  getAiClientWrites: () => request<{ allowed: boolean }>("/ai/client-writes"),
  setAiClientWrites: (allowed: boolean) => request<{ allowed: boolean }>("/ai/client-writes", sendJson("PUT", { allowed })),
  saveApiKey: (apiKey: string) => request<{ saved: boolean }>("/ai/api-key", sendJson("PUT", { apiKey })),
  removeApiKey: () => request<void>("/ai/api-key", { method: "DELETE" }),
  listAiNotes: (interviewId: string) => request<AiNote[]>(`/interviews/${encodeURIComponent(interviewId)}/ai-notes`),
  generateAiNotes: (interviewId: string) =>
    request<AiNoteGeneration>(`/interviews/${encodeURIComponent(interviewId)}/ai-notes`, { method: "POST" }),
  confirmAiNote: (id: string) => request<AiNote>(`/ai-notes/${encodeURIComponent(id)}/confirm`, { method: "POST" }),
  dismissAiNote: (id: string) => request<AiNote>(`/ai-notes/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  restoreAiNote: (id: string) => request<AiNote>(`/ai-notes/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  correctAiNote: (id: string, correction: string) =>
    request<AiNote>(`/ai-notes/${encodeURIComponent(id)}/correction`, sendJson("PUT", { correction })),
  getInterfaceLanguage: () => request<{ language: string }>("/interface-language"),
  setInterfaceLanguage: (language: string) =>
    request<{ language: string }>("/interface-language", sendJson("PUT", { language })),
  listInterviews: (candidateId: string) =>
    request<Interview[]>(`/candidates/${encodeURIComponent(candidateId)}/interviews`),
  addInterview: ({ candidateId, ...fields }: NewInterview) =>
    request<Interview>(`/candidates/${encodeURIComponent(candidateId)}/interviews`, sendJson("POST", fields)),
  getDefaultInterview: (candidateId: string) =>
    request<Interview | null>(`/candidates/${encodeURIComponent(candidateId)}/default-interview`),
  rescheduleInterview: (id: string, fields: { date: string; time: string }) =>
    request<Interview>(`/interviews/${encodeURIComponent(id)}`, sendJson("PUT", fields)),
  suggestInterviewPlan: () => request<InterviewPlanSettings>("/interview-plan-defaults"),
  planInterviewTimes: (input: InterviewPlanRequest, signal?: AbortSignal) =>
    request<InterviewPlan>("/interview-plans", { ...sendJson("POST", input), signal }),
  deleteInterview: (id: string) => request<void>(`/interviews/${encodeURIComponent(id)}`, { method: "DELETE" }),
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
  listSavedQuestions: (candidateId: string, interviewId: string | null) =>
    request<SavedQuestion[]>(
      `/candidates/${encodeURIComponent(candidateId)}/saved-questions` +
        (interviewId ? `?interviewId=${encodeURIComponent(interviewId)}` : ""),
    ),
  addSavedQuestion: (candidateId: string, interviewId: string | null, text: string) =>
    request<SavedQuestion>(
      `/candidates/${encodeURIComponent(candidateId)}/saved-questions`,
      sendJson("POST", { interviewId, text }),
    ),
  editSavedQuestion: (id: string, text: string) =>
    request<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}`, sendJson("PUT", { text })),
  tagSavedQuestion: (id: string, interviewId: string | null) =>
    request<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}/interview`, sendJson("PUT", { interviewId })),
  // The Interviewer's own mark; null removes it, and the state follows the Transcripts again.
  setSavedQuestionAsked: (id: string, asked: boolean) =>
    request<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}/asked`, sendJson("PUT", { asked })),
  removeSavedQuestionMark: (id: string) =>
    request<SavedQuestion>(`/saved-questions/${encodeURIComponent(id)}/mark`, { method: "DELETE" }),
  deleteSavedQuestion: (id: string) => request<void>(`/saved-questions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // position is in the list as shown with the Interview filter interviewId.
  moveSavedQuestion: (id: string, position: number, interviewId: string | null) =>
    request<void>(`/saved-questions/${encodeURIComponent(id)}/position`, sendJson("PUT", { position, interviewId })),
  listRoleQuestions: (role: string) => request<RoleQuestionList>(`/role-questions?${new URLSearchParams({ role })}`),
  addRoleQuestion: (role: string, text: string) => request<RoleQuestion>("/role-questions", sendJson("POST", { role, text })),
  editRoleQuestion: (id: string, text: string) =>
    request<RoleQuestion>(`/role-questions/${encodeURIComponent(id)}`, sendJson("PUT", { text })),
  moveRoleQuestion: (id: string, position: number) =>
    request<void>(`/role-questions/${encodeURIComponent(id)}/position`, sendJson("PUT", { position })),
  deleteRoleQuestion: (id: string) => request<void>(`/role-questions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addRoleQuestionsToCandidates: (role: string) =>
    request<{ candidates: number }>("/role-questions/copies", sendJson("POST", { role })),
  listMissingRoleQuestions: (candidateId: string) =>
    request<RoleQuestion[]>(`/candidates/${encodeURIComponent(candidateId)}/missing-role-questions`),
  addMissingRoleQuestions: (candidateId: string) =>
    request<SavedQuestion[]>(`/candidates/${encodeURIComponent(candidateId)}/missing-role-questions`, { method: "POST" }),
  getInterviewAiStep: (interviewId: string) =>
    request<{ step: InterviewAiStep }>(`/interviews/${encodeURIComponent(interviewId)}/ai-step`),
  listAskedQuestions: (interviewId: string) =>
    request<AskedQuestions | null>(`/interviews/${encodeURIComponent(interviewId)}/asked-questions`),
  findAskedQuestions: (interviewId: string) =>
    request<AskedQuestionGeneration>(`/interviews/${encodeURIComponent(interviewId)}/asked-questions`, { method: "POST" }),
  markAskedQuestionWrong: (id: string, wrong: boolean) =>
    request<AskedQuestion>(`/asked-questions/${encodeURIComponent(id)}/wrong`, sendJson("PUT", { wrong })),
  listSavedQuestionChecks: (candidateId: string) =>
    request<SavedQuestionCheck[]>(`/candidates/${encodeURIComponent(candidateId)}/saved-question-checks`),
  listSavedQuestionStates: (candidateId: string) =>
    request<SavedQuestionState[]>(`/candidates/${encodeURIComponent(candidateId)}/saved-question-states`),
  getCandidateBrief: (candidateId: string) =>
    request<CandidateBrief | null>(`/candidates/${encodeURIComponent(candidateId)}/candidate-brief`),
  listSuggestedQuestions: (candidateId: string) =>
    request<SuggestedQuestion[]>(`/candidates/${encodeURIComponent(candidateId)}/suggested-questions`),
  generateSuggestedQuestions: (candidateId: string, focus: string) =>
    request<SuggestedQuestionGeneration>(
      `/candidates/${encodeURIComponent(candidateId)}/suggested-questions`,
      sendJson("POST", { focus }),
    ),
  acceptSuggestedQuestion: (id: string) =>
    request<SavedQuestion>(`/suggested-questions/${encodeURIComponent(id)}/accept`, { method: "POST" }),
  editSuggestedQuestion: (id: string, text: string) =>
    request<SuggestedQuestion>(`/suggested-questions/${encodeURIComponent(id)}`, sendJson("PUT", { text })),
  dismissSuggestedQuestion: (id: string) =>
    request<SuggestedQuestion>(`/suggested-questions/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  restoreSuggestedQuestion: (id: string) =>
    request<SuggestedQuestion>(`/suggested-questions/${encodeURIComponent(id)}/restore`, { method: "POST" }),
};
