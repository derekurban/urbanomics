// Codex state shared by Settings, the suggestion dialogs and the Organize desk. One fetch serves every
// mounted reader; a save or sign-in anywhere tells the others through a window event.
import { useEffect, useState } from "react";

const api = () => window.urbanomics;
let cached = null, pending = null, saves = 0;
const EVENT = "urbanomics-codex";

export function loadCodex(refresh = false) {
  if (!refresh && pending) return pending;
  const asOf = saves;
  pending = api().codexState(refresh).then((state) => {
    // A save made while this was loading is newer than what came back.
    if (asOf !== saves && cached) state = { ...state, settings: cached.settings };
    cached = state;
    window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
    return state;
  }).finally(() => { pending = null; });
  return pending;
}
export async function saveCodexSettings(values) {
  const settings = await api().saveCodexSettings(values);
  saves++;
  cached = cached ? { ...cached, settings } : cached;
  if (cached) window.dispatchEvent(new CustomEvent(EVENT, { detail: cached }));
  return settings;
}
/** { state, error, reload }. state.settings and state.codex as returned by ai:state. */
export function useCodex() {
  const [state, setState] = useState(cached), [error, setError] = useState("");
  useEffect(() => {
    const listen = (e) => setState(e.detail);
    window.addEventListener(EVENT, listen);
    if (!cached) loadCodex().catch((e) => setError(e.message));
    return () => window.removeEventListener(EVENT, listen);
  }, []);
  return { state, error, reload: (refresh = false) => loadCodex(refresh).then((s) => { setError(""); return s; }).catch((e) => { setError(e.message); throw e; }) };
}
/** Whether a feature can run now, and if not, the one thing to do about it. */
export function readiness(state) {
  if (!state) return { ok: false, reason: "Checking Codex…" };
  if (!state.codex.installed) return { ok: false, reason: "Install the Codex CLI under Settings, Codex." };
  if (!state.codex.signedIn) return { ok: false, reason: "Sign in to Codex under Settings, Codex." };
  if (!state.settings.consent) return { ok: false, reason: "Allow Codex to read your transactions under Settings, Codex." };
  return { ok: true, reason: "" };
}
export const featureLabels = {
  tags: ["Suggest missing tags", "Looks at your transactions and proposes tags (and categories) you don't have yet."],
  restructure: ["Suggest a restructure", "Proposes renames, moves, merges and new categories for the tags you have."],
  aliases: ["Suggest aliases", "Proposes readable names for bank descriptions, with the sentence that recognizes them."],
  organize: ["Smart organizing", "Suggests tags, people, a transfer twin and an event when you open a transaction in Organize."],
};
export const effortLabels = { none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Maximum", ultra: "Ultra" };
export const seconds = (ms) => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
