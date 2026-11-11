import { useEffect, useRef, useState, type ReactNode } from "react";
import { useText } from "./text.tsx";

// The name of the document event that closes every full-screen card.
export const collapsePanels = "collapse-panels";

// A card with a title and a full-screen button that shows on hover or focus. Full screen turns
// the same card into a layer almost the size of the window, over a dimmed page; the card stays
// mounted, so nothing loaded or typed is lost. Escape (outside a field or dialog), the button,
// or a click outside closes it, and Tab stays inside while it is open.
export function ExpandableCard({
  className,
  title,
  titleId,
  label,
  actions,
  children,
}: {
  className: string;
  title: string;
  titleId?: string;
  // A small tag after the title, such as "AI-generated".
  label?: string;
  // Controls shown in the head, before the full-screen button.
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { text } = useText();
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement>(null);

  // The Workspace asks every card to leave full screen when it shows a quote in another card.
  useEffect(() => {
    const collapse = () => setExpanded(false);
    document.addEventListener(collapsePanels, collapse);
    return () => document.removeEventListener(collapsePanels, collapse);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as Element;
      if (event.key === "Escape" && !target.closest("input, textarea, select, dialog")) {
        setExpanded(false);
      } else if (event.key === "Tab" && card.current) {
        keepFocusInside(card.current, event);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.classList.add("panel-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("panel-open");
    };
  }, [expanded]);

  const toggleLabel = expanded ? text.panels.collapse : text.panels.expand;
  return (
    <>
      {expanded && <div className="panel-backdrop" onClick={() => setExpanded(false)} />}
      <section
        ref={card}
        className={`${className}${expanded ? " expanded" : ""}`}
        aria-label={titleId ? undefined : title}
        aria-labelledby={titleId}
        {...(expanded ? { role: "dialog", "aria-modal": true } : {})}
      >
        <header className="panel-head">
          <h2 id={titleId}>
            {title}
            {label && <span className="ai-label">{label}</span>}
          </h2>
          {actions}
          <button
            type="button"
            className="icon-button panel-expand"
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {/* The word joins the icon while the pointer is over the card, so the button is not missed. */}
            {!expanded && <span className="panel-expand-word">{text.panels.expandWord}</span>}
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </>
  );
}

// Moves focus from the last focusable element to the first, or back, so Tab cycles in the card.
function keepFocusInside(container: HTMLElement, event: KeyboardEvent) {
  const focusable = [
    ...container.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex='-1'])"),
  ].filter((element) => element.offsetParent !== null);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
