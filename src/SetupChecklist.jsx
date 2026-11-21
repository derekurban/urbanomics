import React, { useState } from "react";
import { Icon } from "@derekurban/design-system";

// The top of Settings while a workspace is new: four first steps that tick themselves off from real state.
// It goes for good, on this device, once every step is done or it is dismissed. A workspace that already has
// imports and tags the first time Settings opens is not new, so it never shows there.
const key = "urbanomics.setupChecklist.v1";
function readGone() {
  try { return localStorage.getItem(key) === "done"; } catch { return false; }
}
function saveGone() {
  try { localStorage.setItem(key, "done"); } catch {}
}
function seen() {
  try { const was = localStorage.getItem(key); if (!was) localStorage.setItem(key, "open"); return !!was; } catch { return true; }
}

export function SetupChecklist({ steps }) {
  const [gone, setGone] = useState(readGone);
  const [fresh] = useState(() => !seen());
  if (gone || !steps) return null;
  const left = steps.filter((s) => !s.done).length;
  const established = fresh && steps.find((s) => s.id === "import")?.done && steps.find((s) => s.id === "tags")?.done;
  if (!left || established) { saveGone(); return null; }
  return (
    <section className="setup-checklist" aria-label="Getting set up">
      <header>
        <h2>Getting set up</h2>
        <small>{steps.length - left} of {steps.length} done</small>
        <button type="button" className="icon ghost sm" aria-label="Dismiss getting set up" title="Dismiss" onClick={() => { saveGone(); setGone(true); }}>
          <Icon name="x" size={16} />
        </button>
      </header>
      <ol>
        {steps.map((s) => (
          <li key={s.id} data-done={s.done || undefined}>
            <Icon name={s.done ? "circle-check" : "circle-dashed"} size={18} />
            {s.done ? <span>{s.label}</span> : <button type="button" className="link" onClick={s.go}>{s.label}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
