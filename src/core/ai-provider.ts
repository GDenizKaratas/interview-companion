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

export interface AiProvider {
  proposeAiNotes(request: AiNoteRequest): Promise<ProposedAiNote[]>;
}

// Makes a provider for the saved API key. Called only when the Interviewer asks for generation.
export type AiProviderFactory = (apiKey: string) => AiProvider;
