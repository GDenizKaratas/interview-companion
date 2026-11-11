import type { CSSProperties } from "react";

// Steps in the order they are done, as numbered boxes joined by arrows: what to do, in the
// fewest words, with one quiet line under each.
export function StepFlow({ steps, label }: { steps: { title: string; hint: string }[]; label: string }) {
  return (
    // Up to four steps share one row; more are laid out three to a row.
    <ol className={steps.length <= 4 ? "step-flow" : "step-flow rows-of-three"} style={{ "--steps": steps.length } as CSSProperties} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className="step">
          <span className="step-number">{index + 1}</span>
          <strong className="step-title">{step.title}</strong>
          <span className="step-hint">{step.hint}</span>
        </li>
      ))}
    </ol>
  );
}
