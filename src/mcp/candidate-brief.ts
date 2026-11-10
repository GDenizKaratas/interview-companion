// The text of the candidate_brief prompt: a fixed template and rules for writing a Candidate
// Brief. The AI client fills it in from the read-only tools and writes the brief in its own
// chat. Nothing here reads data or checks the result; the app cannot check what an external
// model writes (ADR 0002), so the rules ask the model to say so at the end of the brief.
export function candidateBriefPrompt(candidate: string): string {
  return `Write a Candidate Brief about the Candidate ${JSON.stringify(candidate)} from Interview Companion's data. A Candidate Brief is one document that organizes the Evidence about one Candidate for the Interviewer. It helps the Interviewer prepare; it never judges the Candidate.

Steps:

1. Call list_candidates and find the Candidate whose name or id matches. If none or several match, stop and ask the Interviewer which one.
2. Call get_candidate for the CV and the Interviews in order.
3. Call get_saved_questions and get_interviewer_notes.
4. Call get_ai_notes for each Interview that has a Transcript.
5. Call search_evidence for the role's main topics and for each topic you are about to write about. Run several searches with different words, because it is a keyword search. To report what the Candidate said, search with candidateOnly set to true.

Rules:

- Every statement about the Candidate cites Evidence with a number in square brackets, such as [1]. Evidence is only an exact excerpt from the CV or a Transcript: a search_evidence result or a quote of an AI Note. Write no statement you cannot cite.
- Copy every quote word for word from the tool result, in its original language. Do not translate, shorten, or fix a quote.
- Say that the Candidate said something only when the segment's speakerRole is candidate. A segment whose speakerRole is null is from an unconfirmed Speaker Mapping: say whose label it is and that the speaker is not confirmed.
- No judgments: no hiring recommendation, no score or rating, no ranking or comparison with others, and no words such as strong, weak, good, or impressive about the Candidate. Describe what the Evidence says.
- When nothing is found, write "not found in the indexed sources". Never write that the Candidate lacks a skill.
- Interviewer Notes are the Interviewer's opinion, never Evidence. Put them only in their own section, as the Interviewer's words, and never use them as the reason for a statement.
- For AI Notes: use the correction instead of the statement when there is one. Leave out Dismissed and Stale notes. A Confirmed note reflects its Evidence; it does not mean the Candidate was right. Cite the note's quotes, not the note.
- Use only the tools' data. Add nothing from your own knowledge about the Candidate.
- Write the brief in the language the Interviewer writes to you in. Keep the headings of the template, translated to that language.

Template (the headings marked with # are the brief's own):

# Candidate Brief: <name>, <role>

## Sources
The CV (file name, pages) and each Interview by number and date, with whether its Transcript is imported and its Speaker Mapping confirmed. Say which sources are missing.

## From the CV
Short statements of what the CV says, each with its Evidence numbers.

## From the Interviews
For each Interview in order, short statements of what the Candidate said, each with its Evidence numbers.

## The Interviewer's own notes
The Interviewer Notes, marked as the Interviewer's opinion and not Evidence. Write "None." if there are none.

## Open topics
The Saved Questions, in the Interviewer's order, and topics you searched for and did not find, written as "not found in the indexed sources".

## Reasons and Evidence
One numbered entry per Evidence number used above:
[n] The statement it supports. Reason: why this excerpt supports it. Evidence: "the exact quote" (CV, page p) or (Interview k, segment s, speaker label).

End the brief with this line: "The quotes in this brief were copied by an AI client and are not checked by Interview Companion. Check them in the app before you rely on them."`;
}
