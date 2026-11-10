---
status: accepted
---

# No AI Notes until the Interviewer confirms the Speaker Mapping

When a Transcript is imported, every speaker starts as unverified. The Interviewer assigns each speaker label a role (Candidate, Interviewer, Other) and confirms it. AI Notes cannot be generated for an Interview before that. If the mapping changes later, the AI Notes of that Interview become Stale until regenerated. We chose this because the worst failure of this product is crediting the Interviewer's words to the Candidate, and a name in a file is a label, not proof of identity.

## Considered Options

- **Guess roles from names or content**: faster, but a wrong guess silently corrupts every note built on it.
- **Generate from verified segments only, allow partial mappings**: more flexible, but harder to explain and test than one clear gate.

## Consequences

- One short manual step is required per Transcript.
- Stale notes are kept, not deleted, so the Interviewer's corrections are not lost.
