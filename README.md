# Interview Companion

[Türkçe](README.tr.md)

**Your interviews in one place.** With Interview Companion you can keep each Candidate's CV, Interview Transcripts, your notes, and your questions on one screen, and an AI takes notes from the Transcript for you. No more racing to take notes during the Interview, or searching recordings afterwards for "did the Candidate really say that?"

- **The AI summarizes; it does not interpret.** It bases every note on what the Candidate said in the Interview or wrote in the CV, and shows the quote beside it. If the quote is not in the Transcript word for word, the app does not save the note. A quote shows that the Candidate said it, not that it is true.
- **You decide.** The AI takes notes. It does not score, rank, or decide about anyone.
- **Your data stays on your computer.** You run the app on your own computer; no account needed. Free and open source.

![One Candidate's Workspace: the Transcript, your questions, your notes, and the AI's Interview notes](docs/images/workspace.png)
*One Candidate's Workspace. The screenshots show the Turkish interface; the app is also in English. Every name and Transcript here is fictional.*

## Try it

You need [Node.js](https://nodejs.org) 24 or later and git. Tried on macOS only. If you do not use a terminal, a technical colleague can do this for you once.

```sh
git clone https://github.com/GDenizKaratas/interview-companion.git
cd interview-companion
npm install
npm run demo     # optional: eleven fictional Candidates to try with
npm start
```

Open http://localhost:3000. The app opens in Turkish; switch with the language menu at the top right. Open **Selin Öztürk** to see notes and questions in every state. Running `npm run demo` again resets only the demo Candidates.

## How it works

The **?** button in the app shows the same six steps.

1. **Add a Candidate**: a name and a role. Drop many CVs at once and the names are read from them.
2. **Upload the CV**: a PDF that contains text.
3. **Add an Interview** with its date and time. It shows in the calendar.
4. **Upload the Transcript** after the Interview. Teams and Zoom can give one, and Google Meet with an add-on; **How do I get a Transcript?** in the app shows how.
5. **Confirm the speakers**: who is the Candidate, who is the Interviewer. The AI waits for this.
6. **Check the notes.** Confirm the notes that match their quotes; correct or dismiss the rest.

![A note about the Candidate and the two quotes it rests on](docs/images/note-quotes.png)

You can also keep **Role questions** that every new Candidate of a role gets, see which of **My questions** were asked, search the CV and every Transcript, get Suggested Questions for the next Interview, and export a Candidate to another computer.

## Two ways to use the AI

Everything else works without AI.

| | With an API key | With Claude Desktop or Claude Code (MCP) |
|---|---|---|
| You need | An Anthropic API key (paid by use) | Claude Desktop or Claude Code; no API key |
| You use it by | Pressing a button in the Workspace | Asking in a Claude chat: "Start Interview Companion and tell me what Selin Öztürk said about Terraform." |
| What leaves your computer | The data named beside the button, sent to Anthropic | What Claude reads, sent to the model Claude uses |
| The result appears | In the Interview notes card | In the chat; with **Allow saving here** on, also in the app |

With MCP, Claude reaches the app's data only in a chat where you started it. It answers with a quote and where the quote is from, It can save only its own notes, questions, and Candidate Brief, which replace earlier AI output as a new run in the app does. It cannot delete or change your Candidates, CVs, Transcripts, notes, or questions. Press **Use with MCP** in the app to connect; details in [docs/mcp.md](docs/mcp.md).

## Before you use real data

Interview data is personal data. Before you add a real Candidate, check that:

- the Candidate agreed to the recording and to AI processing of their data,
- your organization allows this data on your computer,
- the AI provider you use is approved for it.

The app does not encrypt its data. We suggest an encrypted disk, and deleting a Candidate when you are done. In Türkiye, the Personal Data Protection Law (No. 6698) applies. This is not legal advice; ask the person responsible for personal data in your organization.

Your data is in your application-data folder, not in the project folder; the app prints its path when it starts. Deleting the project does not delete it. To back up, copy that folder while the app is stopped, or use **Export** on a Candidate.

## What it does not do

- It does not score, rank, or compare Candidates, and the AI decides nothing.
- It does not join or record meetings. You bring the Transcript.
- It has no cloud account. The AI works only when you ask.

<details>
<summary>More screenshots</summary>

![The Candidates list and the Interview calendar](docs/images/home.png)
*Candidates and the Interview calendar: who you meet today, at first glance.*

![Adding many CVs at once: seven CVs and the names read from them](docs/images/add-many.png)
*Many CVs at once: you do not type the names.*

![The guide "How do I get a Transcript?"](docs/images/guide-transcript.png)
*The Transcript guide: the way for each meeting tool, and what to do before you record.*

</details>

## Roadmap

Plans, not promises. Reasons and sources: [docs/research/what-could-come-next.md](docs/research/what-could-come-next.md).

**Next**

- A calendar file (`.ics`) for Planned Interviews, for Google Calendar or Outlook.
- Pasting a Transcript, and reading `.srt` and `.docx` files.
- Printing a Candidate Brief or saving it as a PDF.
- Importing Candidates from a spreadsheet (CSV).

**Needs more work**

- Recording the Interview in the app and turning it into Turkish text, without the voice leaving the computer.
- Fetching Transcripts from Teams or Zoom automatically.
- Live sync with Google Calendar.
- A team working on the same Candidates together.

## For developers

One TypeScript project, three modules: `core` holds every rule and all data access; `web` and `mcp` only call `core`. Data is one SQLite file plus the CV files, in the folder chosen by `src/core/data-folder.ts` (`DATA_DIR` overrides it; `PORT` changes the port); a copy that already has `data/interview-companion.sqlite` in the project folder keeps using it. The app listens only on `127.0.0.1`. Run `npm test`, `npm run typecheck`, and `npm run lint`. Terms: [GLOSSARY.md](GLOSSARY.md). More: [docs/architecture.md](docs/architecture.md), [docs/decisions.md](docs/decisions.md), [docs/mcp.md](docs/mcp.md), [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
