import type { Interview } from "./api.ts";
import { interviewName } from "./interview-names.ts";
import { useText } from "./text.tsx";

// Which Interview's items a card shows, in the card's head. A card opens on all of them, so
// nothing the Interviewer wrote is out of sight until they choose to narrow the list.
export function InterviewFilter({
  interviews,
  value,
  onChange,
}: {
  interviews: Interview[];
  // The Interview shown, or null for all.
  value: string | null;
  onChange: (interviewId: string | null) => void;
}) {
  const { text } = useText();
  if (interviews.length === 0) return null;
  return (
    <select
      className={value === null ? "interview-filter" : "interview-filter narrowed"}
      value={value ?? ""}
      aria-label={text.panels.interviewFilter.label}
      title={text.panels.interviewFilter.label}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{text.panels.interviewFilter.all}</option>
      {interviews.map((interview) => (
        <option key={interview.id} value={interview.id}>
          {interviewName(text, interview)}
        </option>
      ))}
    </select>
  );
}
