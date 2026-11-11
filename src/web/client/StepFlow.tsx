import type { CSSProperties, ReactNode } from "react";

export type Step = { title: string; hint: string; icon: string[]; extra?: ReactNode };

// Steps in the order they are done, as numbered boxes joined by arrows: a small line drawing of
// the step (from step-icons.ts), what to do in the fewest words, and one quiet line under it. Every
// step has a drawing, so the step boxes of every guide look alike. A step may hold one more thing,
// such as a link to a guide for it.
export function StepFlow({ steps, label }: { steps: Step[]; label: string }) {
  return (
    // Up to four steps share one row; more are laid out three to a row.
    <ol className={steps.length <= 4 ? "step-flow" : "step-flow rows-of-three"} style={{ "--steps": steps.length } as CSSProperties} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className="step">
          <span className="step-head">
            <span className="step-number">{index + 1}</span>
            <span className="step-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {step.icon.map((d) => (
                  <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
            </span>
          </span>
          <strong className="step-title">{step.title}</strong>
          <span className="step-hint">{step.hint}</span>
          {step.extra}
        </li>
      ))}
    </ol>
  );
}
