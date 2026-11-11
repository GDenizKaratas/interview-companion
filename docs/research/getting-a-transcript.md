# Getting a Transcript of a Turkish Interview

Researched on 2026-11-11 for #89, from each vendor's own help or pricing pages where one could be read. Each point gives its source. Points listed under "Could not be confirmed" must not be written into the app as fact.

The question: the app reads a WebVTT file (`.vtt`) with speaker names, or plain text where every line is `Speaker: text`. How does an Interviewer in Türkiye, who interviews in Turkish, get such a file, and what if they have no paid meeting plan?

## Short answer

- **Google Meet transcripts are offered in a short list of languages, and Turkish is not on it.** "Download it from Google Meet" is not an answer for a Turkish Interview today. See [google-meet-transcripts.md](google-meet-transcripts.md) and the check of 2026-11-11 below.
- **For a Turkish Interview on Google Meet, Tactiq is the route the guide gives** (checked 2026-11-11 for #105): it lists Turkish for Meet, has a free plan of 10 transcripts a month, and exports a TXT file. It is a third party that keeps the transcript. See "Tactiq for Google Meet" below.
- **Microsoft Teams on a work or school account, and Zoom on a paid plan, transcribe Turkish** and give a `.vtt` with speaker names.
- **With no paid plan**, no meeting tool gives a transcript with speaker names. The realistic route is to record the call and transcribe the recording on one's own computer with a tool that labels speakers. A note-taker service that joins the call also works, but it sends the Candidate's voice to another company.

## Routes

| Route | Turkish | Paid plan | Speaker names in the file | File | Where the audio goes |
|---|---|---|---|---|---|
| Microsoft Teams transcript | Yes [1][2] | A work or school account with transcription allowed by the administrator [2][3]. For personal accounts the help page mentions recording only [4]. | Yes: "each speaker's name and time stamp" [1] | `.vtt` or `.docx`; by default only the organiser and co-organisers can download [1] | Microsoft's cloud [5] |
| Zoom audio transcript of a cloud recording | Yes [6] | Pro, Business, Education, or Enterprise [6]. Basic has local recording only [7]. | Yes; a person Zoom cannot identify is "Unknown Speaker" [6] | `.vtt`, from Recordings & Transcripts, Cloud recordings [6] | Zoom's cloud |
| Google Meet transcript, or Gemini "Take notes for me" | No [8] | Workspace; "Take notes for me" also with Google AI Pro or Ultra [9] | Not applicable | A Google Doc | Google |
| Buzz (Whisper on the computer) | Whisper covers about 100 languages | Free, open source [11] | Yes, and they can be renamed; not on Intel Macs [12] | `.txt`, `.srt`, `.vtt` [11] | Stays on the computer by default [11] |
| MacWhisper (Whisper on a Mac) | Whisper covers about 100 languages [10] | Free, or Pro for a one-time price [10] | "Automatic Speaker Recognition" [10] | `.srt`, `.vtt`, `.txt`, and others [10] | Stays on the Mac [10] |
| whisper.cpp, WhisperX (command line) | As Whisper | Free | whisper.cpp: no. WhisperX: generic labels such as `SPEAKER_00` [13][14] | `.srt` (WhisperX) | Stays on the computer |
| Fireflies (note-taker) | Yes [15] | Download needs a paid plan [16] | Yes | `.pdf`, `.docx`, `.srt`, and others; no `.vtt` [16] | The vendor's cloud |
| Tactiq (note-taker in the browser) | "Turkish (Turkey)" is listed for Google Meet [19] | Free: "10 transcripts / mo"; Pro $8 a month, billed annually [30] | Yes: "each line gets tagged to the person who spoke it" [32] | TXT, read by the app's plain-text reader if its lines are `Name: text` (not confirmed) [31] | Tactiq |
| Fathom, tl;dv (note-takers) | Turkish is listed [17][18] | Not confirmed | Not confirmed | Not confirmed | The vendor's cloud |
| Live captions of Windows or Chrome | Windows: no. Chrome: Turkish is listed [20][21] | None | No, and captions are not stored [20][21] | None | Stays on the device |

## What the app reads today

- A Teams-style `.vtt` with `<v Name>` voice tags, and a Zoom-style `.vtt` with `Name: text` lines, are both handled by the WebVTT reader (fixtures `teams-style.vtt` and `speaker-prefix.vtt`). Both fixtures are written by hand; neither vendor documents the file's layout. One real export of each, with fictional content, would confirm it.
- A `.vtt` with no speaker names is refused by design (fixture `no-speaker.vtt`): the app does not guess who spoke.
- The app has no reader for `.srt` or `.docx`, and no box to paste text into.

## Consent and the law in Türkiye

From the Personal Data Protection Law, No. 6698 [22]:

- Article 3: explicit consent is freely given, specific, and informed.
- Article 5: personal data is processed with explicit consent, or under another condition the law lists.
- Article 7: data is erased once the reason for processing it ends.
- Article 9: sending data abroad needs an adequacy decision or appropriate safeguards; otherwise only an occasional transfer is allowed, for example with explicit consent after the person is told the risks.
- Article 10: the person is told who the controller is, the purpose, the recipients, the method and legal basis, and their rights.

From a principle decision of the Personal Data Protection Board [23]: the information notice and a consent text are separate, and consent is not asked for where another legal basis applies.

This is what the sources say. It is not legal advice.

## If the app transcribed audio itself

- Anthropic's Claude API takes text, images, and PDF files, and has no speech-to-text [28]. A separate component would be needed.
- On the computer: whisper.cpp is open source; its large model takes about 3 GB on disk and about 4 GB of memory, and it has Node.js bindings [13]. It does not separate speakers; sherpa-onnx adds that, with Node.js packages [29]. Nothing leaves the computer. How well either does on Turkish interviews is untested here.
- In a cloud: several speech services list Turkish with speaker separation [25][26][27]. In every case the Candidate's voice leaves the computer and, unless the service hosts in Türkiye, the country.

## Check of Google Meet's languages, 2026-11-11

Re-read on 2026-11-11 for #93: https://support.google.com/meet/answer/12849897 says "Meeting transcripts are available in: English, French, German, Italian, Japanese, Korean, Portuguese, Spanish". Turkish is not listed. Turkish appears in Meet for live captions and translation, which give no transcript file (see "Tactiq for Google Meet" below). Since #105 the guide's Meet tab says Meet's own transcript has no Turkish yet, gives Tactiq for those who stay on Meet, and points to Teams and Zoom.

## Tactiq for Google Meet, 2026-11-11

Checked for #105.

- Languages: Tactiq's help page lists "Turkish (Turkey)" among 63 languages for Google Meet [19].
- Price: the Free plan has "10 transcripts / mo"; Pro is $8 a month per user, billed annually [30].
- Security: the pricing page claims "ISO 27001 Certification", "SOC 2 Type II Attestation", and "GDPR Compliant" [30]. These are Tactiq's own claims, not checked here.
- Where the data goes: Tactiq, a third party, keeps the transcripts. For a Candidate this matters for consent and, if Tactiq stores it outside Türkiye, for sending data abroad under Law No. 6698 (Article 9 above). The guide tells the Interviewer to tell the Candidate.
- Export: a TXT export holds "Meeting name, date, and duration", "Speaker names", "Highlights (if any)", and "The full transcript of the meeting" [31].
- Line layout: Tactiq says "each line gets tagged to the person who spoke it" [32]. No Tactiq page read here shows a sample line or says that each line carries a time. The plain-text reader now accepts an optional time before `Name: text` ("00:01:23", "00:01:23.456", "1:23", "[00:01:23]", "(00:01:23)") so a timed line imports with its time. A header line such as `Date: ...` would be read as a speaker; the Interviewer marks it Other at the Speaker Mapping. One real export with fictional content is needed to confirm the import.

Google Meet's live captions, read the same day [33]: Turkish is listed with no beta label, and "All users can use captions in these languages"; "The captions are turned on only for you". Meet shows captions live and does not save them.

## Could not be confirmed

- The exact licences Teams needs for transcription, and whether a free Teams account can transcribe.
- The real line layout of a Teams or Zoom `.vtt`, of a Teams `.docx`, and of a `.vtt` exported by Buzz or MacWhisper with speaker labels.
- Whether MacWhisper's speaker recognition needs the Pro version.
- The export formats and free-plan rules of tl;dv and Fathom, and where each note-taker stores its data.
- The exact line layout of Tactiq's TXT export, whether its lines carry times, and in which country Tactiq stores transcripts.
- Otter's language list from Otter itself; other sources say it has no Turkish.
- Prices of the cloud speech services, and whether each separates speakers for Turkish.
- An independent measure of how accurate any of these is on Turkish.
- Any Board decision specifically about recording job interviews.

## Sources

All read on 2026-11-11.

1. https://support.microsoft.com/en-us/office/start-stop-and-download-live-transcripts-in-microsoft-teams-meetings-dc1a8f23-2e20-4684-885e-2152e06a4a8b
2. https://learn.microsoft.com/en-us/microsoftteams/meeting-transcription-captions
3. https://learn.microsoft.com/en-us/microsoftteams/recording-transcription-overview
4. https://support.microsoft.com/office/record-a-meeting-in-microsoft-teams-free-85d16331-2669-426e-b12a-02aefe6f5308
5. https://learn.microsoft.com/en-us/microsoftteams/tmr-meeting-recording-change
6. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064927
7. https://zoom.us/pricing
8. https://support.google.com/meet/answer/12849897
9. https://9to5google.com/2026/06/29/google-meet-take-notes-ai-pro-ultra/ (a news site, not Google)
10. https://macwhisper.com
11. https://chidiwilliams.github.io/buzz/docs
12. https://chidiwilliams.github.io/buzz/docs/usage/speaker_identification
13. https://github.com/ggml-org/whisper.cpp
14. https://github.com/m-bain/whisperX
15. https://guide.fireflies.ai/articles/2973706448-learn-about-fireflies-supported-languages
16. https://guide.fireflies.ai/articles/3319752033-how-to-download-transcripts-summaries-and-meeting-recordings-from-fireflies
17. https://intercom.help/tldv/en/articles/6231678-how-to-change-transcript-language
18. https://help.fathom.video/en/articles/296192
19. https://help.tactiq.io/en/articles/8627989-what-languages-does-tactiq-support
20. https://support.microsoft.com/en-us/windows/use-live-captions-to-better-understand-audio-b52da59c-14b8-4031-aeeb-f6a47e6055df
21. https://support.google.com/chrome/answer/10538231
22. https://www.kvkk.gov.tr/Icerik/6649/Personal-Data-Protection-Law
23. https://www.kvkk.gov.tr/Icerik/8710/
25. https://elevenlabs.io/docs/capabilities/speech-to-text
26. https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html
27. https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
28. https://platform.claude.com/docs/en/build-with-claude/overview
29. https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html
30. https://tactiq.io/buy
31. https://help.tactiq.io/en/articles/9784666-how-to-export-your-tactiq-meeting-transcript
32. https://tactiq.io/learn/how-to-separate-speakers-in-a-meeting-transcript
33. https://support.google.com/meet/answer/15077804
