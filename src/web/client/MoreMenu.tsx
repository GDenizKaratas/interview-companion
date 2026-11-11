import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onChoose: () => void;
  // Shown in the colour of an action that deletes.
  danger?: boolean;
}

// The "more" button of the Workspace bar: the things done rarely, one click further away.
// Escape or a click elsewhere closes the menu; choosing an item closes it first, so a dialog the
// item opens gives focus back to the button.
export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div
      ref={menu}
      className="more-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
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
