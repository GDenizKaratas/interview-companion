import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onChoose: () => void;
  // Shown in the colour of an action that deletes.
  danger?: boolean;
}

// The "more" button of the Workspace bar: the things done rarely, one click further away.
// Escape or a click elsewhere closes the menu. Choosing an item closes it before the item runs,
// so a dialog the item opens is not left with an open menu behind it.
export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    // Listened for on the document: a browser that does not focus a clicked button would not
    // send the key to the menu itself.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={menu} className="more-menu">
      <button ref={button} type="button" className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="more-menu-items" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "more-menu-item danger" : "more-menu-item"}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                item.onChoose();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
