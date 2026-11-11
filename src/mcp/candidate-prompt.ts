// The text of the candidate prompt: the explicit start of a conversation about Interview
// Companion's Candidates, the way to be sure the AI application uses this app. The server's
// standing instructions use the tools only on such an explicit request. Claude Code passes the
// words after the command one per argument, split at spaces, so the prompt has one optional
// argument and a name may arrive as its first word only; the text says to match the start of a
// name. It points to the tools and the standing instructions, which hold the rules; it adds none.
export function candidatePrompt(candidate?: string): string {
  const name = candidate?.trim();
  const start = name
    ? `Find the Candidate whose name matches or starts with ${JSON.stringify(name)} with list_candidates. If none matches, say that there is no such Candidate in Interview Companion; if several match, ask me which one. Then tell me what is known about them, and answer my next questions about them.`
    : "First ask me which Candidate and what I want to know.";
  return `This conversation is about Interview Companion: answer my questions about its Candidates from its data. ${start}

Use Interview Companion's tools: list_candidates to find a Candidate, then get_candidate, search_evidence with several words, and get_cv, get_transcript, get_interviewer_notes, get_ai_notes, get_asked_questions, and get_saved_questions as the question needs. Do not answer about someone outside the app.

Follow Interview Companion's instructions: a short quote and its place for every statement, say what was not found, and no verdict about the Candidate.`;
}
