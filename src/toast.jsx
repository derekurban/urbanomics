// One place for transient confirmations: the package Toast, stacked bottom-left of the page area.
// notify({ title, description, tone, action: { label, onClick }, duration }) returns an id; `actions`
// (an array of the same) puts several buttons on one toast.
import React, { useEffect, useRef, useState } from "react";
import { Toast, Button } from "@derekurban/design-system";

const listeners = new Set();
let seq = 0;
export function notify(toast) {
  const id = toast.id || `toast-${++seq}`;
  const item = { duration: 5000, tone: "neutral", ...toast, id };
  listeners.forEach((listen) => listen({ type: "add", item }));
  return id;
}
export function dismissToast(id) {
  listeners.forEach((listen) => listen({ type: "remove", id }));
}

function TimedToast({ item, onDone }) {
  const timer = useRef(null);
  const [leaving, setLeaving] = useState(0);
  const start = () => {
    clearTimeout(timer.current);
    if (item.duration > 0) timer.current = setTimeout(() => setLeaving((n) => n + 1), item.duration);
  };
  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [item]);
  useEffect(() => {
    if (leaving) onDone(item.id);
  }, [leaving]);
  return (
    <div className="toast-item" data-tone={item.tone} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={start} onFocus={() => clearTimeout(timer.current)} onBlur={start}>
      <Toast
        title={item.title}
        description={item.description}
        tone={item.tone}
        onDismiss={() => onDone(item.id)}
        action={(item.actions || (item.action ? [item.action] : [])).length > 0 && (
          <span className={"toast-actions" + ((item.actions || []).length > 1 ? " is-several" : "")}>
            {(item.actions || [item.action]).map((action) => (
              <Button key={action.label} variant="ghost" size="sm" onClick={() => { action.onClick(); onDone(item.id); }}>
                {action.label}
              </Button>
            ))}
          </span>
        )}
      />
    </div>
  );
}

export function ToastRegion() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const listen = (event) =>
      setItems((list) =>
        event.type === "remove"
          ? list.filter((t) => t.id !== event.id)
          : [...list.filter((t) => t.id !== event.item.id), event.item].slice(-3),
      );
    listeners.add(listen);
    return () => listeners.delete(listen);
  }, []);
  return (
    <div className="toast-region du-host" aria-label="Notifications">
      {items.map((item) => (
        <TimedToast key={item.id + ":" + item.title} item={item} onDone={(id) => setItems((list) => list.filter((t) => t.id !== id))} />
      ))}
    </div>
  );
}
