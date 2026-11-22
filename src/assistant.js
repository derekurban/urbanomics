// Assistant state shared by Settings, the suggestion dialogs and the Organize desk. One fetch serves every
// mounted reader; a save anywhere tells the others through a window event.
import { useEffect, useState } from "react";

const api = () => window.urbanomics;
let cached = null, pending = null, saves = 0;
const EVENT = "urbanomics-assistant";

export function loadAssistant(refresh = false) {
  if (!refresh && pending) return pending;
  const asOf = saves;
  pending = api().assistantState(refresh).then((state) => {
    // A save made while this was loading is newer than what came back.
    if (asOf !== saves && cached) state = { ...state, settings: cached.settings };
    cached = state;
    window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
    return state;
  }).finally(() => { pending = null; });
  return pending;
}
export async function saveAssistantSettings(values) {
  const settings = await api().saveAssistantSettings(values);
  saves++;
  cached = cached ? { ...cached, settings } : cached;
  if (cached) window.dispatchEvent(new CustomEvent(EVENT, { detail: cached }));
  return settings;
}
/** { state, error, reload }. state.settings and state.claude as returned by ai:state. */
export function useAssistant() {
  const [state, setState] = useState(cached), [error, setError] = useState("");
  useEffect(() => {
    const listen = (e) => setState(e.detail);
    window.addEventListener(EVENT, listen);
    if (!cached) loadAssistant().catch((e) => setError(e.message));
    return () => window.removeEventListener(EVENT, listen);
  }, []);
  return { state, error, reload: (refresh = false) => loadAssistant(refresh).then((s) => { setError(""); return s; }).catch((e) => { setError(e.message); throw e; }) };
}
/** Whether a feature can run now, and if not, the one thing to do about it. */
export function readiness(state) {
  if (!state) return { ok: false, reason: "Checking the assistant…" };
  if (!state.claude.key.present) return { ok: false, reason: "Add your Anthropic API key under Settings, Assistant." };
  if (!state.claude.ok) return { ok: false, reason: state.claude.error || "Anthropic didn't accept the API key. Check it under Settings, Assistant." };
  if (!state.settings.consent) return { ok: false, reason: "Allow Claude to read your transactions under Settings, Assistant." };
  return { ok: true, reason: "" };
}
export const featureLabels = {
  tags: ["Suggest missing tags", "Looks at your transactions and proposes tags (and categories) you don't have yet."],
  restructure: ["Suggest a restructure", "Proposes renames, moves, merges and new categories for the tags you have."],
  aliases: ["Suggest vendors", "Groups bank descriptions that are the same place under one vendor name, with the matchers that recognize them."],
  organize: ["Smart organizing", "Suggests tags, people, a transfer twin and an event when you open a transaction in Organize."],
};
export const effortLabels = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Maximum" };
export const seconds = (ms) => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
/** "claude-haiku-5-5" reads as "Haiku 5.5". */
export function modelLabel(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id || "");
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}` : id || "Claude";
}
