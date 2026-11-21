import React, { useEffect, useId, useRef } from "react";
import { Icon } from "@derekurban/design-system";

// The app's dialog: the package Dialog's spec on the native <dialog>, so dialogs open in the top layer,
// stack over each other and keep long forms scrolling inside. size: "narrow" (confirmations), default, "wide".
export function WorkspaceModal({
  title,
  onClose,
  children,
  footer,
  className = "",
  size = "",
}) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    // showModal focuses the first focusable element, which is the close button. Start where the person works
    // instead: an element marked data-autofocus (Cancel in a destructive confirmation), else the first field.
    const start =
      dialog.querySelector("[data-autofocus]:not(:disabled)") ||
      dialog.querySelector('.workspace-dialog-scroll :is(input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea):not(:disabled)');
    start?.focus();
    return () => {
      dialog.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`workspace-dialog ${size ? "is-" + size : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon ghost" aria-label={`Close ${typeof title === "string" ? title : "dialog"}`} onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </header>
      <div className="workspace-dialog-scroll">{children}</div>
      {footer && <div className="workspace-dialog-footer">{footer}</div>}
    </dialog>
  );
}
