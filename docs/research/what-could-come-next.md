# What could come next

Written on 2026-11-11 for #91, as the project's own research. Nothing here is promised. Each idea says what it would give, what it needs, and, for the heavy ones, why they are heavy. Facts carry their source; a point marked **not confirmed** was not checked against a primary source in this research and must not be repeated as fact.

## Worth doing

### A calendar file (`.ics`) for Planned Interviews

- **Gives:** the Interviewer's Planned Interviews in Google Calendar, Outlook, or Apple Calendar through the calendar's own file import, with the Candidate's name and the time.
- **Needs:** an export in core that writes the iCalendar format (RFC 5545), and a button. No account, no permission from any vendor, no network.
- **Limit:** a file is a copy. A changed or cancelled Interview must be exported again. That is most of what live calendar sync would give, without its cost (see below).

### Paste a Transcript; read `.srt` and `.docx`

- **Gives:** fewer steps. Today the app reads WebVTT and plain `Speaker: text` lines from a file, and has no box to paste text into ([getting-a-transcript.md](getting-a-transcript.md)).
- **Why these formats:** Teams can download a transcript as `.docx`, WhisperX and Fireflies write `.srt`, and a Google Meet transcript is a Google Doc that downloads as `.docx` or `.txt` ([getting-a-transcript.md](getting-a-transcript.md), [google-meet-transcripts.md](google-meet-transcripts.md)).
- **Needs:** one reader per format in core, each with a fixture. The real layout of a Teams `.docx` and of a Meet `.txt` is **not confirmed**; one real export with fictional content is needed for each before a reader is written. As today, a file without speaker names is refused rather than guessed.

### Speech-to-text on the computer for a recording

- **Gives:** a Transcript when no meeting tool gives one, for example a Turkish Interview on Google Meet, with the Candidate's voice never leaving the computer.
- **Needs:** a local model. whisper.cpp is open source, its large model takes about 3 GB on disk and 4 GB of memory, and it has Node.js bindings; it does not separate speakers, and sherpa-onnx adds that ([getting-a-transcript.md](getting-a-transcript.md), sources 13 and 29 there). The Claude API has no speech-to-text, so the model cannot do this part.
- **Open:** how well either does on Turkish Interviews is untested. The Interviewer would still confirm the speakers, as for any Transcript.

### Print or PDF of a Candidate Brief

- **Gives:** a brief to read before a meeting or to bring into it.
- **Needs:** a print layout for the brief, with its quotes and their found or not-found marks. The browser's own "Save as PDF" could be enough.

### CSV import of Candidates

- **Gives:** many Candidates from a spreadsheet or an applicant tracking system's export, without one PDF each.
- **Needs:** a step where the Interviewer matches columns to name and role, and core's existing checks for each row. A CV still comes as a PDF.

## Possible but heavy

### Fetching Transcripts automatically from Google Meet, Teams, or Zoom

- **Google Meet does not transcribe Turkish.** Its supported transcript languages are English, French, German, Italian, Japanese, Korean, Portuguese, and Spanish ([Google Meet help](https://support.google.com/meet/answer/12849897), read for [google-meet-transcripts.md](google-meet-transcripts.md)). For a Turkish Interview there is nothing to fetch. Transcript entries from the Meet REST API are deleted 30 days after the meeting (same document).
- **Google's verification.** An app that asks for sensitive or restricted scopes must meet requirements beyond brand verification: an appropriate use case, a demonstration video of the whole OAuth flow, limited use of the data, the narrowest scopes with a justification, and, for restricted scopes, an annual security assessment by an assessor Google approves ([Google Cloud help, answer 13464321](https://support.google.com/cloud/answer/13464321), read on 2026-11-11). Which exact scopes reading Meet transcripts or Drive files needs, and whether each is sensitive or restricted, is **not confirmed**.
- **Microsoft's consent.** Microsoft Graph's API for a Teams meeting transcript works only with a work or school account (personal accounts are not supported) and uses the permission `OnlineMeetingTranscript.Read.All`. For the application form of that permission, a tenant administrator must create an application access policy ([Get callTranscript](https://learn.microsoft.com/en-us/graph/api/calltranscript-get), read on 2026-11-11). Whether the delegated permission also needs an administrator's consent is **not confirmed**. Either way, the Interviewer's IT department is involved.
- **Zoom's review.** A public or unlisted Zoom app goes through the Zoom App Marketplace's review; private and beta apps do not ([Zoom app review process](https://developers.zoom.us/docs/distribute/app-review-process/), read on 2026-11-11). How a private app can be shared with people outside the developer's account is **not confirmed**.
- **A local app and callbacks.** The vendors announce a finished transcript by sending a message (a webhook or a change notification) to an address on the internet. An app that listens only on `127.0.0.1` cannot receive it, so it would have to ask each vendor again and again, or the project would need a server on the internet, which breaks the local design ([ADR 0001](../adr/0001-local-single-user-sqlite.md)). That each vendor's notification needs a public address is **not confirmed** from the vendors' pages in this research.
- **In short:** three separate vendor reviews or consents, a feature that gives nothing for Turkish on Meet, and a design that would no longer be local. Downloading the file and importing it stays the honest route.

### Live Google Calendar sync

- **Gives:** Interviews that appear and update in Google Calendar by themselves.
- **Needs:** the same Google OAuth verification as above, since calendar data is user data behind OAuth scopes. Whether the narrowest calendar scope counts as sensitive is **not confirmed**. Microsoft Outlook would need its own consent.
- **Why the `.ics` file first:** it puts the same Interviews in the calendar with no account and no review. What it lacks is the update when a time changes.

### One database shared by several people over a network drive

- **Gives:** a team working on the same Candidates.
- **Why heavy:** SQLite's own guidance is that "if your data is separated from the application by a network, you want to use a client/server database", and that network filesystems can corrupt an SQLite database through unreliable file locking ([SQLite: SQLite Over a Network](https://www.sqlite.org/useovernet.html), read on 2026-11-11).
- **Needs:** a real server with a client/server database, accounts, and permissions per Candidate. That is a different product from the local, one-Interviewer app this project decided to build ([ADR 0001](../adr/0001-local-single-user-sqlite.md)).
