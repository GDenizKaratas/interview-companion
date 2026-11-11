import { useState } from "react";
import { api, ApiError, type SpeakerRole, type Transcript } from "./api.ts";
import { useText } from "./text.tsx";

// Core checks the roles; this list only sets the order of the buttons.
const roleChoices: SpeakerRole[] = ["candidate", "interviewer", "other"];
// How much of a speaker's first words is shown to help tell who the label is.
const sampleLength = 60;

// The Speaker Mapping of one Transcript, as one line that opens into a form. Until it is confirmed
// the line is a warning the Interviewer clicks to confirm; once confirmed it is a quiet line with
// an Edit button. Roles are never guessed: the Interviewer chooses each one (ADR 0004).
export function SpeakerMapping({ transcript, onConfirmed }: { transcript: Transcript; onConfirmed: (transcript: Transcript) => void }) {
  const { text } = useText();
  const t = text.panels.transcript.speakers;
  const confirmed = transcript.speakerMappingConfirmedAt !== null;
  const [editing, setEditing] = useState(false);

  if (!confirmed && !editing) {
    return (
      <button type="button" className="speaker-mapping folded unconfirmed" onClick={() => setEditing(true)}>
        <span className="speaker-mapping-alert">
          <WarningIcon /> {t.notConfirmed}
        </span>
        <span className="speaker-mapping-call">{t.clickToConfirm}</span>
      </button>
    );
  }
  if (!editing) {
    return (
      <div className="speaker-mapping folded">
        <span>
          {t.title}: <span className="speaker-mapping-confirmed">✔ {t.confirmed}</span>
        </span>
        <button type="button" className="quiet" onClick={() => setEditing(true)}>
          {t.edit}
        </button>
      </div>
    );
  }
  return (
    <SpeakerMappingForm
      transcript={transcript}
      onCancel={() => setEditing(false)}
      onConfirmed={(updated) => {
        setEditing(false);
        onConfirmed(updated);
      }}
    />
  );
}

function SpeakerMappingForm({
  transcript,
  onCancel,
  onConfirmed,
}: {
  transcript: Transcript;
  onCancel: () => void;
  onConfirmed: (transcript: Transcript) => void;
}) {
  const { text } = useText();
  const t = text.panels.transcript.speakers;
  // Starts from the confirmed roles when editing, and from nothing before the first confirmation.
  const [roles, setRoles] = useState<Partial<Record<string, SpeakerRole>>>(() =>
    Object.fromEntries(transcript.speakers.flatMap((speaker) => (speaker.role ? [[speaker.id, speaker.role]] : []))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const complete = transcript.speakers.every((speaker) => roles[speaker.id] !== undefined);

  async function confirm() {
    setSaving(true);
    setError(undefined);
    try {
      onConfirmed(await api.confirmSpeakerMapping(transcript.interviewId, roles as Record<string, SpeakerRole>));
    } catch (caught) {
      setError(refusalMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  // Core decides whether the roles make a valid mapping; this only says why not, in the current language.
  function refusalMessage(caught: unknown): string {
    if (!(caught instanceof ApiError)) return t.saveFailed;
    if (caught.status === 404) return t.changed;
    if (caught.field === "candidate") return caught.rule === "format" ? t.oneCandidate : t.needCandidate;
    if (caught.field === "interviewer") return t.needInterviewer;
    return t.saveFailed;
  }

  // The Candidate is one speaker, so choosing it for a second one takes it from the first, the
  // way a radio button moves. Core still checks the mapping when it is confirmed.
  function choose(speakerId: string, role: SpeakerRole) {
    const next = { ...roles, [speakerId]: role };
    if (role === "candidate") {
      for (const other of transcript.speakers) {
        if (other.id !== speakerId && next[other.id] === "candidate") delete next[other.id];
      }
    }
    setRoles(next);
    setError(undefined);
  }

  return (
    <div className="speaker-mapping editing">
      <button type="button" className="icon-button speaker-mapping-close" aria-label={t.cancel} title={t.cancel} disabled={saving} onClick={onCancel}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <p className="speaker-mapping-gate">{t.gate}</p>
      <ul className="speaker-list">
        {transcript.speakers.map((speaker) => (
          <li key={speaker.id} className="speaker-row">
            <div className="speaker-who">
              <span className="segment-speaker">{speaker.label}</span>
              <span className="speaker-sample">{firstWords(transcript, speaker.id)}</span>
            </div>
            <div className="role-choices" role="group" aria-label={speaker.label}>
              {roleChoices.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={roles[speaker.id] === role ? "role-choice chosen" : "role-choice"}
                  aria-pressed={roles[speaker.id] === role}
                  onClick={() => choose(speaker.id, role)}
                >
                  {t.roles[role]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="speaker-mapping-actions">
        <button type="button" disabled={!complete || saving} onClick={() => void confirm()}>
          {t.confirm}
        </button>
        <button type="button" className="quiet" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </button>
        {!complete && <span className="hint">{t.chooseAll}</span>}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8l6.6 11.7H1.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.3v3.4M8 11.6v.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// The start of what a speaker first said, so the Interviewer can tell who the label is.
function firstWords(transcript: Transcript, speakerId: string): string {
  const said = transcript.segments.find((segment) => segment.speakerId === speakerId)?.text ?? "";
  const oneLine = said.replace(/\s+/g, " ").trim();
  return oneLine.length > sampleLength ? `“${oneLine.slice(0, sampleLength).trimEnd()}…”` : `“${oneLine}”`;
}
