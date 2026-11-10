import type { Interview } from "./api.ts";
import { interviewName } from "./interview-names.ts";
import { useText } from "./text.tsx";

// The Interview an Interviewer Note or a Saved Question is tagged with, shown as a small dropdown
// so it can be changed in one click. The empty choice means no Interview.
export function InterviewTagSelect({
  interviews,
  value,
  onChange,
}: {
  interviews: Interview[];
  value: string | null;
  onChange: (interviewId: string | null) => void;
}) {
  const { text } = useText();
  return (
    <select
      className="note-tag"
      value={value ?? ""}
      aria-label={text.panels.interviewTag.label}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{text.panels.interviewTag.none}</option>
      {interviews.map((interview) => (
        <option key={interview.id} value={interview.id}>
          {interviewName(text, interview)}
        </option>
      ))}
    </select>
  );
}
