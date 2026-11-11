// How much AI work one save may hold, whoever wrote it: the app's own model, the AI client
// through MCP, or an imported Candidate. Each artifact applies them where it is saved, so no
// way in can store more. They are generous for a real Interview; they only keep one save from
// flooding the Workspace. The MCP tools show the same numbers in their schemas.
export const aiWorkLimits = {
  aiNotes: 40,
  askedQuestions: 60,
  suggestedQuestions: 25,
  // Quotes per AI Note, Asked Question answer, or Suggested Question.
  quotesPerItem: 8,
  // Characters in one statement, question, summary, reason, or quote.
  text: 2000,
  briefEvidence: 100,
  briefText: 50_000,
} as const;

// Whether one proposed item fits: every text within the length limit and at most the quotes
// allowed. An item that does not fit is dropped, like one whose quote is not found.
export function fitsLimits(texts: string[], quoteCount: number): boolean {
  return quoteCount <= aiWorkLimits.quotesPerItem && texts.every((text) => text.length <= aiWorkLimits.text);
}
