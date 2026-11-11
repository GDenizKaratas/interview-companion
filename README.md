# Interview Companion

[Türkçe](README.tr.md)

**Your interviews in one place.** Stop racing to take notes during an Interview, and stop searching recordings afterwards for what the Candidate said. Interview Companion keeps each Candidate's CV, Interviews, Transcripts, your notes, and your questions together, and an AI takes notes from the Transcript for you.

- **Every note stands next to the Candidate's own words.** Each line the AI writes rests on a quote from the Transcript; if the quote is not in the Transcript word for word, the app does not save the line. A quote shows that the Candidate said it, not that it is true.
- **You decide.** The AI takes notes. It does not score, rank, or decide about anyone.
- **Your data stays on your computer.** There is no account, and the app has no server. It is free and open source.

![One Candidate's Workspace: the Transcript on the left, questions in the middle, notes and the AI's Interview notes on the right](docs/images/workspace.png)
*One Candidate's Workspace: the CV and Transcript, your questions, your notes, and the Interview notes the AI took, on one screen. The screenshots show the Turkish interface; the app is also in English.*

Every name, CV, and Transcript in this repository and its screenshots is fictional.

## How you use it, in six steps

The **?** button in the app shows the same six steps.

1. **Add a Candidate.** A name and a role are enough. With many Candidates, drop their CVs together; the names are read from the CVs.
2. **Upload the CV.** A PDF that contains text.
3. **Add an Interview.** With its date and time. You can plan Interviews for several Candidates at once; all of them show in the calendar.
4. **Upload the Transcript.** After the Interview, the text of the meeting. Teams and Zoom give this file; the guide in the app, **How do I get a Transcript?**, says how.
5. **Confirm the speakers.** Who is the Candidate, who is the Interviewer? The AI does nothing until you confirm.
6. **Check the notes.** The AI drafts them, with quotes. You confirm what matches, and correct or dismiss what does not.

![A note about the Candidate and the two quotes it rests on](docs/images/interview-notes.png)
*A click on a note opens the quotes it rests on; one more click shows the place in the Transcript.*

## What you need

- **Setup:** done once, with a few commands ([below](#setup)). If you do not use a terminal, ask a technical colleague. Tried on macOS; not tried on Windows or Linux.
- **A Transcript:** Microsoft Teams (work or school account) and Zoom (paid plan) give a file with the speakers' names. Google Meet's own transcript has no Turkish yet ([Google's help page](https://support.google.com/meet/answer/12849897)); for Turkish, use [Tactiq](https://tactiq.io) (the first 10 transcripts a month are free; Tactiq keeps the transcript) and import its TXT file, as the guide explains. For other cases, the guide explains recording the Interview with the Candidate's consent and turning it into text on your computer.
- **For the AI,** one of the two ways below. Everything else in the app works without AI.

## Two ways to use the AI

| | With an API key | With Claude Desktop or Claude Code (MCP) |
|---|---|---|
| What you need | An API key from Anthropic (paid by use), saved in the app once | Claude Desktop or Claude Code on your computer, connected to the app once. No API key |
| How you use it | You press a button in the Workspace | You ask in Claude about a Candidate by name: "What did Selin Öztürk say about Terraform?" |
| What leaves your computer | When you press the button, the data named beside the button goes to Anthropic | What Claude reads goes to the model Claude uses |
| Where the result appears | In the Interview notes card of the Workspace | In the Claude chat; with **Allow saving here** on, the notes, questions, and Candidate Brief also appear in the app |

Connected over MCP, Claude reads the app's data directly; you copy nothing. The answer comes with its quote and where the quote is from: the CV, or which Interview. It says so when something is written in the CV but was not talked about in an Interview, or is not there at all. Claude can read, and with your permission save only what it wrote itself; it cannot delete or change Candidates, Interviews, CVs, Transcripts, or your notes. To connect, press **Use with MCP** in the app; details are in [docs/mcp.md](docs/mcp.md).

## What else is there

- The **Candidates** list with a role filter, one-click sorting, today's and this week's Interviews, and the **Interview calendar**.
- **Role questions** for each role: every new Candidate of that role gets a copy.
- **My questions**: each shows whether it was asked in an Interview; your own mark comes before what the AI found.
- Search across the CV and every Transcript; each result is a quote and leads to its place.
- Suggested Questions for the next Interview; you add the ones you want to your list.
- Export a Candidate as a file and import it into another copy of the app.
- Turkish and English interface; eleven demo Candidates to try it with.

<details>
<summary>More screenshots</summary>

![The Candidates list and the Interview calendar](docs/images/home.png)
*Candidates and the Interview calendar: who you meet today, at first glance.*

![Adding many CVs at once: seven CVs and the names read from them](docs/images/add-many.png)
*Many CVs at once: you do not type the names.*

![The guide "How do I get a Transcript?"](docs/images/guide-transcript.png)
*The Transcript guide: the way for each meeting tool, and what to do before you record.*

</details>

## What it deliberately does not do

- It does not score, rank, or compare Candidates.
- The AI decides nothing.
- It does not join or record meetings. You bring the Transcript.
- It has no cloud account. The AI works only when you ask, with your own key or your own Claude application.

## Before you use real data

Interview data is personal data. Before you add a real Candidate, make sure of three things: the Candidate agreed to the recording and to AI processing of their data; your organization allows this data on your computer; the AI provider you use is approved for it. The app does not encrypt its data folder: use an encrypted disk, and delete a Candidate when you are done. In Türkiye, the Personal Data Protection Law (No. 6698) applies. This is not legal advice; ask the person responsible for personal data in your organization.

## Setup

You need [Node.js](https://nodejs.org) 24 or later and git.

```sh
git clone https://github.com/GDenizKaratas/interview-companion.git
cd interview-companion
npm install
npm run demo     # optional: loads the eleven demo Candidates
npm start
```

Then open http://localhost:3000 in a browser. The interface starts in Turkish; the language menu is at the top right. Running `npm run demo` again gives a fresh demo set and leaves your own Candidates alone.

## On the agenda

Plans, not promises. The reasons and sources are in [docs/research/what-could-come-next.md](docs/research/what-could-come-next.md).

**Next**

- A calendar file (`.ics`) for Planned Interviews: one import and they are in Google Calendar or Outlook.
- Pasting a Transcript, and reading `.srt` and `.docx` files.
- Printing a Candidate Brief or saving it as a PDF.
- Importing Candidates from a spreadsheet (CSV).

**Needs more work**

- Recording the Interview inside the app and turning it into Turkish text: no extra software, and the voice does not leave the computer.
- Fetching Transcripts from Teams or Zoom automatically: each company has its own approval process.
- Live sync with Google Calendar: it needs Google's verification; the calendar file gives most of the value.
- A team working on the same Candidates together: it needs a real server with accounts and permissions.

## For developers

One TypeScript project with three modules: `core` holds every rule and all data access; `web` (a local server and the browser interface) and `mcp` (the MCP server) only call `core`. The data is in `data/` inside the project folder (one SQLite file and the CV files); set `DATA_DIR` for another folder and `PORT` for another port. The app listens only on your own computer (`127.0.0.1`). Run `npm test`, `npm run typecheck`, and `npm run lint`. The terms used in code and documents are in [GLOSSARY.md](GLOSSARY.md); more in [docs/architecture.md](docs/architecture.md), [docs/decisions.md](docs/decisions.md), [docs/adr](docs/adr), [docs/mcp.md](docs/mcp.md), and [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
