import { useState } from "react";
import { api, ApiError, type SpeakerRole, type Transcript } from "./api.ts";
import { useText } from "./text.tsx";

const roleChoices: SpeakerRole[] = ["candidate", "interviewer", "other"];

// The Speaker Mapping of one Transcript. Until it is confirmed, it stays open and asks the
// Interviewer to give every speaker a role. Once confirmed, it folds into one line with an
// Edit button. Roles are never guessed: the Interviewer chooses each one (ADR 0004).
export function SpeakerMapping({ transcript, onConfirmed }: { transcript: Transcript; onConfirmed: (transcript: Transcript) => void }) {
  const { text } = useText();
  const t = text.panels.transcript.speakers;
  const confirmed = transcript.speakerMappingConfirmedAt !== null;
  const [editing, setEditing] = useState(false);

  if (confirmed && !editing) {
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
      onCancel={confirmed ? () => setEditing(false) : undefined}
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
  onCancel: (() => void) | undefined;
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
      setError(caught instanceof ApiError && caught.status === 404 ? t.changed : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="speaker-mapping">
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
                  onClick={() => setRoles({ ...roles, [speaker.id]: role })}
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
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel} disabled={saving}>
            {t.cancel}
          </button>
        )}
        {!complete && <span className="hint">{t.chooseAll}</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// The start of what a speaker first said, so the Interviewer can tell who the label is.
function firstWords(transcript: Transcript, speakerId: string): string {
  const said = transcript.segments.find((segment) => segment.speakerId === speakerId)?.text ?? "";
  const oneLine = said.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `“${oneLine.slice(0, 60).trimEnd()}…”` : `“${oneLine}”`;
}
