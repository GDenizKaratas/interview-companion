# Interview Companion

A workspace that helps a technical interviewer prepare for interviews, take notes, and find what a candidate actually said. It organizes evidence; it never judges candidates.

## Language

### People

**Interviewer**:
The single person who uses the application and owns everything in it.
_Avoid_: User, reviewer, recruiter

**Candidate**:
A person being interviewed for a role. A Candidate has one CV and any number of Interviews.
_Avoid_: Applicant, interviewee

### Sources

**Interview**:
One conversation with a Candidate. Interviews may have a date and are numbered by it (First Interview, Second Interview); those without a date come after the dated ones, in the order they were added. It may have a Transcript.
_Avoid_: Meeting, session, round

**Planned**:
An Interview whose date is after today. An Interview dated today or earlier has taken place; one without a date is neither.
_Avoid_: Upcoming, scheduled

**CV**:
The document a Candidate submitted. It belongs to the Candidate, not to an Interview.
_Avoid_: Resume

**Transcript**:
The text of one Interview, split into segments with a speaker label and, when the source provides them, timestamps.
_Avoid_: Recording, minutes

**Evidence**:
An exact excerpt from a CV or a Transcript. Nothing else is Evidence.
_Avoid_: Source, proof, citation

### Written by people and by AI

**Speaker Mapping**:
The Interviewer's confirmed assignment of each speaker label in a Transcript to a role: Candidate, Interviewer, or Other. Until it is confirmed, every speaker is unverified.
_Avoid_: Speaker identification, diarization

**Interviewer Note**:
A short note the Interviewer wrote about a Candidate, optionally tied to one Interview. It is never Evidence of what a Candidate said, and AI never changes it.
_Avoid_: My note, personal note, human note (in code and documents; the Workspace panel itself is titled "My Notes")

**AI Note**:
One AI-generated statement about an Interview, backed by at least one piece of Evidence and carrying its own review state.
_Avoid_: Summary, insight, AI summary

**Stale**:
The state of an AI Note whose Speaker Mapping changed after it was generated. A Stale AI Note stays visible but is not trusted; regenerating gives new notes made from the current mapping. A reviewed Stale note is kept and stays Stale.
_Avoid_: Outdated, invalid

**Review State**:
Where an AI Note stands with the Interviewer: Unreviewed, Confirmed (matches its Evidence), Corrected (the Interviewer rewrote it; the original text is kept), or Dismissed (hidden, not deleted). Confirming a note says it reflects the Evidence, not that the Candidate was right.
_Avoid_: Status, approval

**Suggested Question**:
A question AI proposed on the Interviewer's request, with a reason and, when available, Evidence. It is replaced when suggestions are regenerated.
_Avoid_: Recommendation, generated question

**Saved Question**:
A question on the Interviewer's own list, either written by hand or copied from a Suggested Question on acceptance, optionally tied to one Interview. Regenerating suggestions never changes it.
_Avoid_: Accepted question, follow-up

**AI client**:
An AI application the Interviewer runs outside the app, such as Claude Code or Claude Desktop, connected to it through MCP. It can read; when the Interviewer allows it, it can also save AI Notes and Suggested Questions, which core checks like the app's own.
_Avoid_: Agent, assistant, bot

**Candidate Brief**:
A single document about one Candidate that an external AI client writes from the application's data, with the reason and Evidence for each statement listed at the end. When saving from the AI client is on, the client saves it in the application: one per Candidate, replaced by the next one. The application does not check its statements, but it checks each quote against the CV and Transcripts every time the brief is read.
_Avoid_: Report, profile, summary

### Workspace

**Workspace**:
The single screen that shows everything about one Candidate: CV, Interviews, Interviewer Notes, AI Notes, and questions.
_Avoid_: Dashboard, profile page
