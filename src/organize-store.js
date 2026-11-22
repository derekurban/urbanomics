// What the Organize desk learns from Claude, kept for the app session rather than the page (the answers,
// dismissals and what Claude applied are also saved in the workspace and loaded back on the next session): the
// suggestions per row, the rows Claude organized, the tags it created and a running batch. Leaving
// Organize and coming back finds them as they were, and a batch keeps its progress and Stop button.
// Rows put off with Later stay out of the advance order for the session too.
import {useEffect, useState} from 'react';

const listeners = new Set();
export const organizeStore = {
  suggestions: new Map(),   // row id → {status: 'loading' | 'done' | 'error' | 'dismissed', result?, error?, promise?}
  autoApplied: new Set(),   // rows Claude organized this session
  createdTags: new Map(),   // "flow:name" → {id, name, color} or a promise of one
  later: new Set(),         // rows put off with Later
  batch: null,              // the visible progress of a running batch, or null
  run: null,                // the running batch itself (its stop flag, queue and counts)
  quiet: 0,                 // while above zero, success toasts are held (Apply automatically)
  summary: null,            // a finished batch's closing toast, held until Organize is open again
  host: null,               // the mounted desk (or the last one), which a running batch works through
  mounted: 0,
  lastOpen: null,           // the row last open, for n
  version: 0,               // bumped on every change, for memoised views
  hydrated: false,          // whether the suggestions kept in the workspace have been loaded this session
};
export function changed() { organizeStore.version++; for (const listen of listeners) listen(); }
export function setBatch(batch) { organizeStore.batch = batch; changed(); }
/** Re-renders the caller whenever the store changes. */
export function useOrganizeStore() {
  const [, setTick] = useState(0);
  useEffect(() => { const listen = () => setTick(n => n + 1); listeners.add(listen); return () => { listeners.delete(listen); }; }, []);
  return organizeStore;
}
/** Start over (a test or a workspace reset); never while a batch runs. */
export function resetOrganizeStore() {
  if (organizeStore.run) return false;
  organizeStore.suggestions.clear(); organizeStore.autoApplied.clear(); organizeStore.createdTags.clear(); organizeStore.later.clear();
  organizeStore.batch = null; organizeStore.summary = null; organizeStore.lastOpen = null; organizeStore.hydrated = false; changed();
  return true;
}
