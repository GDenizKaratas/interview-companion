# Workspace wireframe

Status: **implemented**. This is a sketch of the screen; the running app is the reference for details.

## Wide screen

From about 1180 pixels wide, the Workspace fills the window and does not scroll; each card scrolls inside. The page opens on the Candidate's Default Interview, so the cards show content at once.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ❝ Interview Companion   Your interviews, all in one place.     [?] [Use with an API key] [Use with MCP] [English ▾] │ navy app bar
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ‹ Deniz Yılmaz Senior Backend Engineer [First Interview · 3 Nov 11:00 ▾] ✎ [+ Interview] │
│                                              [🔍 Search the CV and Transcripts…] [Candidate Brief] ⋯ │ one bar, one row
├─────────────────────┬──────────────────────────────┬─────────────────────────────────────┤
│ SOURCES [CV|Transcript] │ QUESTIONS                 ⛶  │ MY NOTES                         ⛶  │
│ Speakers: ✔ confirmed   │ My questions 6 | Suggest   2 of 6 asked │ [Write a note, Enter to save…] │
│                         │ [Write a question, Enter…]   │ Ask about idempotency               │
│ 18:42 Deniz  Candidate  │ ● How did you make it…       ├─────────────────────────────────────┤
│   We used Redis with…   │   Asked in First Interview   │ AI (AI-generated)                ⛶  │
│ 19:05 Ayşe  Interviewer │ ◌ How do you test…           │ Questions and answers | Notes about │
│   How did you handle…   │   Not found in First Interview │ Background jobs                   │
│                         │ ○ What would you change…     │   Used Redis with BullMQ…           │
│                         │   Planned                    │                                     │
└─────────────────────┴──────────────────────────────┴─────────────────────────────────────┘
```

## Cards and reasons

1. **Bar.** One row that never wraps on a wide screen: back, who the Candidate is, the Interview selector with an edit button, "+ Interview", the search, the Candidate Brief, and a "⋯" menu with Export and Delete Candidate. The selector lists the Interviews with readable dates and times, and "All Interviews" last. "+ Interview" and the edit button open one dialog with date and time; deleting an Interview is in that dialog and asks first. The search is one field, and Enter searches the CV and Transcripts. Its results open in a panel under the bar, over the Workspace, so they never push the cards down; what to search, and "only what the Candidate said" with its explanation, are chosen there. Clicking a result closes them and opens and marks that place.
2. **Sources.** The CV and the Transcript share one narrow card with two tabs. Both stay loaded. The card opens on the Transcript when the Default Interview has one, and on the CV otherwise; a quote or a search result switches it, and closes any card that is full screen.
3. **Questions, the widest card, at full height.** The box to write in stays in place and the list scrolls. Each Saved Question has a mark for its state: asked (a link to the exchange), looked for and not found, or planned. Its tag, origin, and buttons show with the pointer or focus. Suggested Questions are the second tab; nothing is loaded or generated until the Interviewer opens it and asks.
4. **My Notes above the AI card.** The note box is always ready to type in. The AI card is titled "Interview notes" and labelled "AI draft · you check": the AI is the Interviewer's note-taker, never a judge. Until an Interview has output, the card shows a thin row of four steps (Transcript, Speakers, AI draft, Your check), the one next step with its button, and two boxes that say who does what: the AI reads the Transcript and pulls out questions and notes with quotes; the Interviewer checks them and evaluates the Candidate. When everything is ready, one button, "Pull out questions and notes", does both, and two rows of small labels say what is sent to the model and what stays. With output, the card has two tabs, "Questions and answers" first and "Notes about the Candidate"; the card never says asked or not asked, which is the Questions card's wording. An Answer Summary is marked as the AI's summary, and an AI Note is a short row that opens the note with its quotes and review actions; one the Interviewer has not checked has a dashed edge. "Show in Transcript" on a quote, or "Open in the Transcript" on an exchange, shows that segment in the Sources card.
5. **Full screen.** Each card has a full-screen button (⛶) that shows when the pointer is over the card. Escape, the ✕ button, or a click outside closes it.

On middle screens the cards form two columns, Questions and My Notes first. On a narrow screen they stack: My Notes, Questions, Sources, AI.

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
| Questions and answers | "Every question you asked in this Interview, each with a short summary of the answer." | "Reading the Transcript…" | "Generation failed. Your data was not changed." |
| AI Notes, no API key | "Add an API key to generate AI Notes here, or use the Candidate Brief from your AI client." | — | — |
| Questions | "No questions saved." | — | — |

Empty panels keep their place. They are never filled with sample or generated content.

## Middle and narrow screens

Below about 1180 pixels, the panels form two columns that grow with their content: CV and Transcript, then My Notes and AI Notes, then Questions.

Below about 760 pixels, panels stack in this order: bar, My Notes, CV, Transcript, AI Notes, Questions. My Notes goes first because it is the panel used during an interview.
