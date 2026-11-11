// What no AI text about a Candidate may do. The app helps the Interviewer remember what was
// said; it does not form an opinion of the person. The same rules go to the app's own model, in
// its prompts, and to the Interviewer's AI client, in the brief prompt and the descriptions of
// the tools that save its work, so the two ways of using AI are held to one standard.

// The private matters an AI never writes down, even when they were talked about.
export const privateMatters = "health, pregnancy, family, age, religion, origin, politics, military service, or other private matters";

// The rules as lines of a prompt's rule list.
export const neutralityRules = [
  "- No adjective or adverb that praises or faults the candidate or an answer, such as strong, weak,",
  "  clearly, vaguely, impressive, confident, or struggled.",
  "- Do not infer what the candidate feels, knows, or can do beyond the words said. Keep the candidate's",
  '  own hedges and scope, such as "I think", "we", or "the team did": do not turn them into certainty or "I".',
];

// The same rules in one sentence, for a tool's description.
export const writingRulesInBrief =
  "Write no word that praises or faults the Candidate or an answer, infer nothing beyond the words said, keep the " +
  `Candidate's own hedges such as "I think" or "the team did", and write nothing about ${privateMatters}.`;
