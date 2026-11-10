# Google Meet transcripts

Researched on 2026-11-10 for #10, from Google's own help pages, developer documentation, and Workspace blog. Each point gives its source. Points marked **not documented** could not be confirmed from any Google source.

## Where a transcript goes

- A Meet transcript is a **Google Doc**. "Meeting transcripts are saved in the meeting organizer's Google Drive in the "Google Meet" folder", with one sub-folder per meeting. ([Use transcripts with Google Meet](https://support.google.com/meet/answer/12849897))
- Before July 2026 the folder was "Meet Recordings". It is now renamed "Legacy Meet Recordings" and moved inside "Google Meet". ([Record a video meeting](https://support.google.com/meet/answer/9308681), [2022 announcement](https://workspaceupdates.googleblog.com/2022/10/google-meet-transcripts.html))
- The host, co-hosts, and the person who started the transcript get an e-mail with a link, and the Doc is attached to the Calendar event. ([12849897](https://support.google.com/meet/answer/12849897), [Admin: turn transcription on or off](https://knowledge.workspace.google.com/admin/meet/turn-meeting-transcription-on-or-off))
- Transcripts need a paid Workspace edition (for example Business Standard and Plus, Enterprise, Education Plus, Workspace Individual). They are not available on personal accounts. ([12849897](https://support.google.com/meet/answer/12849897))
- Supported spoken languages are English, French, German, Italian, Japanese, Korean, Portuguese, and Spanish. **Turkish is not listed.** ([12849897](https://support.google.com/meet/answer/12849897))

## What the Doc looks like

- Google says only that the transcript "includes a list of attendees". ([Admin page](https://knowledge.workspace.google.com/admin/meet/turn-meeting-transcription-on-or-off))
- **Not documented:** the title line, the date header, how a speaker is written (`Name: text` or the name on its own line), how often times appear and in what form, and whether there is a footer. Google shows no example.
- With Gemini "Take notes for me", the transcript can be a tab of the notes Doc, and the notes cite times as `(00:08:32)`. ([Workspace blog, 2025-02](https://workspaceupdates.googleblog.com/2025/02/transcript-citations-take-notes-for-me-google-meet.html))

## Files a user can get

- A Google Doc can be downloaded as `.docx`, `.odt`, `.rtf`, `.pdf`, `.txt`, `.html`, `.epub`, or `.md`. ([Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats))
- **Not documented:** what the `.txt` download of a Meet transcript looks like.
- Meet makes **no `.vtt` or `.srt` caption file**. Captions can only be burned into a recording. The `.sbv` file Meet saves is the chat, not the speech. ([9308681](https://support.google.com/meet/answer/9308681))
- The Meet REST API returns transcript entries as JSON (`participant`, `text`, `languageCode`, `startTime`, `endTime`). They are deleted 30 days after the meeting, and "might not match the transcription found in the Docs transcript file". This is an API, not a file the Interviewer has. ([Transcript entries](https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords.transcripts.entries), [Meet artifacts](https://developers.google.com/workspace/meet/api/guides/artifacts))

## Outcome

No Meet adapter is added (decision 120). The only file Meet gives is a Google Doc whose layout Google does not document, so an adapter would be built on a guess. The plain-text adapter reads a Doc downloaded as `.txt` only if every turn is a `Name: text` line and nothing comes before the first one. A header with a title or attendees, which Google says is there, makes it refuse the file. A WebVTT file never comes from Meet.

To settle it, export one real Meet transcript with fictional content as `.txt` and look at it. If it does not import, that file is the fixture for a Meet adapter.
