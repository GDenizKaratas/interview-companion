# Workspace wireframe

Status: **conceptual**. This is a sketch of the planned screen, not a screenshot of working software.

## Wide screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Candidates   Deniz Yılmaz · Senior Backend Engineer            [EN | TR]   │
│ Interview: [ All ▾ ]  1st · 2026-11-03   2nd · planned     [+ New interview] │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ CV                  [Search…] │ MY NOTES                                     │
│ ┌───────────────────────────┐ │ ┌──────────────────────────────────────────┐ │
│ │                           │ │ │ Write a note, Enter to save…             │ │
│ │   PDF page 1 of 2         │ │ └──────────────────────────────────────────┘ │
│ │                           │ │ • Ask about idempotency          1st · 14:02 │
│ │                           │ │ • Interesting Redis example      1st · 14:10 │
│ └───────────────────────────┘ │ • Check scale of last project    no interview│
├───────────────────────────────┼──────────────────────────────────────────────┤
│ TRANSCRIPT          [Search…] │ AI NOTES  (AI-generated)        [Generate]   │
│ Speakers: ✔ confirmed [Edit]  │ ┌──────────────────────────────────────────┐ │
│                               │ │ Described using Redis and BullMQ for     │ │
│ 18:42 Candidate               │ │ background jobs.            ❝ 18:42      │ │
│   "We used Redis with BullMQ…"│ │ Unreviewed   [Confirm] [Correct] [Dismiss]│ │
│ 19:05 Interviewer             │ └──────────────────────────────────────────┘ │
│   "How did you handle retries"│                                              │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ QUESTIONS                                                                    │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Write a question, Enter to save…                                         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 1. How did you make the payment job idempotent?              written by you  │
│ 2. What happens when a BullMQ job fails three times?    from a suggestion ⓘ  │
│                                                                              │
│ ▸ Suggest questions                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Panel order and reasons

1. **Header.** Who the Candidate is and which Interview is selected. The Interview selector filters the Transcript, AI Notes, and tagged notes.
2. **Top row: CV and My Notes.** These are the two panels used before and during an interview, so they sit where the eye lands first. The note box is always ready to type in.
3. **Middle row: Transcript and AI Notes.** A source and what was extracted from it sit side by side. Clicking the ❝ mark on an AI Note scrolls the Transcript to that segment and highlights it.
4. **Bottom: Questions.** Saved Questions first. "Suggest questions" is one collapsed line; nothing is generated until the Interviewer opens it and asks.

## How authorship is shown

| Content | How it looks |
|---|---|
| Evidence (CV and Transcript text) | Plain text in its source panel, always with a location. |
| Interviewer Note, hand-written question | Normal text, no badge. This is the default voice of the screen. |
| AI Note, Suggested Question | A visible "AI-generated" label and a different background. |
| Unverified speaker | A grey "unverified" tag instead of a role. |
| Stale AI Note | A warning tag: "Speakers changed. Regenerate to trust this note." |

## The reason behind a suggestion

Each Suggested Question shows one short line under it, for example "CV mentions BullMQ; retries were not discussed in the 1st interview." The ⓘ mark opens the exact quotes on hover or click. Nothing more is shown unless asked.

## States

| Panel | Empty | Loading | Error |
|---|---|---|---|
| CV | "No CV uploaded." + upload button | "Reading PDF…" | "This PDF has no readable text." |
| Transcript | "No transcript available." + import button | "Importing…" | "This file format is not supported." + the supported formats |
| Speakers | — | — | "Confirm who is speaking before generating AI Notes." |
| My Notes | "No personal notes yet." | — | "Note could not be saved." The text stays in the box. |
| AI Notes | "AI Notes have not been generated." | "Generating…" | "Generation failed. Your data was not changed." |
| AI Notes, no API key | "Add an API key to generate AI Notes here, or use the Candidate Brief from your AI client." | — | — |
| Questions | "No questions saved." | — | — |

Empty panels keep their place. They are never filled with sample or generated content.

## Narrow screen

Panels stack in this order: header, My Notes, CV, Transcript, AI Notes, Questions. My Notes goes first because it is the panel used during an interview.
