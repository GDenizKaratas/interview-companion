import type { CSSProperties, ReactNode } from "react";

// Steps in the order they are done, as numbered boxes joined by arrows: what to do, in the
// fewest words, with one quiet line under each. A step may hold one more thing, such as a link to a
// guide for it, and a small picture of what the step is about.
export function StepFlow({ steps, label }: { steps: { title: string; hint: string; extra?: ReactNode; icon?: ReactNode }[]; label: string }) {
  return (
    // Up to four steps share one row; more are laid out three to a row.
    <ol className={steps.length <= 4 ? "step-flow" : "step-flow rows-of-three"} style={{ "--steps": steps.length } as CSSProperties} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className="step">
          <span className="step-head">
            <span className="step-number">{index + 1}</span>
            {step.icon && <span className="step-icon">{step.icon}</span>}
          </span>
          <strong className="step-title">{step.title}</strong>
          <span className="step-hint">{step.hint}</span>
          {step.extra}
        </li>
      ))}
    </ol>
  );
}
