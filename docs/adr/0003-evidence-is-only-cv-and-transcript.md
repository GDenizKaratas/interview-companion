---
status: accepted
---

# Evidence is only CV and Transcript excerpts, checked by code

Evidence means an exact excerpt from a CV or a Transcript. Interviewer Notes are not Evidence: AI may read them when suggesting questions, but never as a source for what the Candidate said. Every AI Note is one statement with at least one quote, and the application rejects the note if the quote does not appear word for word in the source. We chose this because a prompt alone cannot guarantee that a model does not invent a quote, while an exact-match check can, and it can be tested.

## Consequences

- AI Notes are small, separate records, not a free-text summary. Each has its own Review State.
- Quotes are never translated or cleaned up, even when the interface language differs from the source language.
- A correct observation that the model cannot back with an exact quote is dropped. We accept losing some notes to keep the guarantee.
