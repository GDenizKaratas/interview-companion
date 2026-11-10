# Workspace wireframe

Status: **implemented**. This is a sketch of the screen; the running app is the reference for details.

## Wide screen

From about 1180 pixels wide, the Workspace fills the window and does not scroll. Everything about the Candidate is visible at once.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ❝ Interview Companion   Your interviews, all in one place.     [AI settings] [English ▾] │ navy app bar
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ← Candidates  Deniz Yılmaz Senior Backend Engineer  [All ▾] [+ New Interview]            │
│               [Search for a word…] [CV and Transcripts ▾] ☐ Only the Candidate [Search] 🗑 │ one bar
├──────────────────────────┬────────────────────────────┬──────────────────────────────────┤
│ CV                    ⛶  │ TRANSCRIPT              ⛶  │ MY NOTES                      ⛶  │
│ ┌──────────────────────┐ │ Speakers: ✔ confirmed [Edit]│ [Write a note, Enter to save…]  │
│ │                      │ │                            │ • Ask about idempotency   1st    │
│ │   PDF page 1 of 2    │ │ 18:42 Deniz  Candidate     ├──────────────────────────────────┤
│ │                      │ │   We used Redis with…      │ AI NOTES (AI-generated)       ⛶  │
│ │                      │ │ 19:05 Ayşe  Interviewer    │ Described using Redis… ❝ 18:42   │
│ │                      │ │   How did you handle…      ├──────────────────────────────────┤
│ │                      │ │                            │ QUESTIONS                     ⛶  │
│ └──────────────────────┘ │                            │ 1. How did you make it…          │
└──────────────────────────┴────────────────────────────┴──────────────────────────────────┘
```

On a wide screen the whole bar is one line. On a narrower one, the search moves to a second line.

## Panel order and reasons

1. **Bar.** Who the Candidate is, which Interview is selected, and the search, in one line. The Interview selector filters the Transcript, AI Notes, and tagged notes. The search covers the CV and Transcripts. Its results open in a panel under the bar, over the Workspace, so they never push the panels down. Clicking a result closes them and opens and marks that place (decision 139). Delete sits at the far end, as an icon.
2. **CV and Transcript, at full height.** The two sources are read the most, so they get the most room.
3. **The working column: My Notes, AI Notes, Questions.** These are what the Interviewer writes and reviews during and after an interview. The note box is always ready to type in. Clicking the ❝ mark on an AI Note scrolls the Transcript to that segment and highlights it. "Suggest questions" is one collapsed line; nothing is generated until the Interviewer opens it and asks.
4. **Full screen.** Each panel has a full-screen button (⛶) that shows when the pointer is over the panel. It opens the panel almost full screen over a dimmed Workspace, without reloading it. Escape, the ✕ button, or a click outside closes it.

## How authorship is shown

| Content | How it looks |
|---|---|
| Evidence (CV and Transcript text) | Plain text in its source panel, always with a location. |
| Interviewer Note | Normal text, no badge. This is the default voice of the screen. |
| Saved Question | Normal text with its Interview tag in a small dropdown and a quiet origin label: "written by you" or "from a suggestion". |
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

## Middle and narrow screens

Below about 1180 pixels, the panels form two columns that grow with their content: CV and Transcript, then My Notes and AI Notes, then Questions.

Below about 760 pixels, panels stack in this order: bar, My Notes, CV, Transcript, AI Notes, Questions. My Notes goes first because it is the panel used during an interview.
