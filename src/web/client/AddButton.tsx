import type { ButtonHTMLAttributes } from "react";

// The one look for every button that adds something: dark, with a plus icon before the label.
export function AddButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={className ? `add-button ${className}` : "add-button"}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
      {children}
    </button>
  );
}
