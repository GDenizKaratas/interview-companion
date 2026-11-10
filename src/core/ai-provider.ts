import type { SpeakerRole } from "./transcripts.ts";

// The narrow interface between core and a model. Core decides what is sent and checks what
// comes back; a provider only turns a request into proposed notes. The Claude provider talks
// to the real model, and tests use a fake one.

export interface AiNoteRequest {
  // The interface language as a code such as "en" or "tr". Statements are written in it;
  // quotes stay in the language of the Transcript.
  language: string;
  // Every segment of the Transcript in spoken order, with the role from the confirmed Speaker
  // Mapping. Speaker labels are not sent: they can be real names, and the role is what matters.
  segments: { number: number; role: SpeakerRole; text: string }[];
}

// What the model proposes. Nothing here is trusted until core has checked every quote.
export interface ProposedAiNote {
  statement: string;
  evidence: { segmentNumber: number; quote: string }[];
}

// What core sends when the Interviewer asks for Suggested Questions. Interviewer Notes are sent
// here, and only here, as context for follow-up questions; they are never Evidence.
export interface QuestionRequest {
  // The interface language. Questions and reasons are written in it; quotes stay as they are.
  language: string;
  // What the Interviewer wants the questions to be about, or null for no focus.
  focus: string | null;
  // The CV's text page by page, or an empty list when the Candidate has no CV.
  cvPages: { number: number; text: string }[];
  // Each Transcript whose Speaker Mapping is confirmed, in Interview order.
  transcripts: {
    interviewId: string;
    interviewNumber: number;
    segments: { number: number; role: SpeakerRole; text: string }[];
  }[];
  interviewerNotes: string[];
  // So the model does not propose a question the Interviewer already has.
  savedQuestions: string[];
}

// One exact excerpt a suggestion cites: a CV page or a Transcript segment.
export type ProposedQuestionEvidence =
  | { source: "cv"; page: number; quote: string }
  | { source: "transcript"; interviewId: string; segmentNumber: number; quote: string };

// What the model proposes. A suggestion without Evidence is a general question.
export interface ProposedQuestion {
  question: string;
  reason: string;
  evidence: ProposedQuestionEvidence[];
}

export interface AiProvider {
  proposeAiNotes(request: AiNoteRequest): Promise<ProposedAiNote[]>;
  proposeQuestions(request: QuestionRequest): Promise<ProposedQuestion[]>;
}

// Makes a provider for the saved API key. Called only when the Interviewer asks for generation.
export type AiProviderFactory = (apiKey: string) => AiProvider;
